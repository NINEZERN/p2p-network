package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Message struct {
	Author string    `json:"author"`
	Text   string    `json:"text"`
	At     time.Time `json:"at"`
}
type Ticket struct {
	ID       string    `json:"id"`
	Owner    string    `json:"-"`
	Subject  string    `json:"subject"`
	Category string    `json:"category"`
	Status   string    `json:"status"`
	Messages []Message `json:"messages"`
	Rating   int       `json:"rating"`
	Updated  time.Time `json:"updated"`
}
type diskTicket struct {
	Ticket
	OwnerHash string `json:"ownerHash"`
}
type Peer struct {
	ID   string    `json:"id"`
	Seen time.Time `json:"seen"`
}
type Signal struct {
	Seq  int             `json:"seq"`
	From string          `json:"from"`
	To   string          `json:"to"`
	Data json.RawMessage `json:"data"`
}
type Room struct {
	Members    map[string]time.Time
	Signals    []Signal
	Seq        int
	Generation int
}
type Server struct {
	NextGeneration int
	mu             sync.Mutex
	Tickets        map[string]*Ticket
	Peers          map[string]time.Time
	Rooms          map[string]*Room
	File, Admin    string
}

func random(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func bearer(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}
func (s *Server) admin(r *http.Request) bool {
	t := bearer(r)
	return len(s.Admin) > 0 && subtle.ConstantTimeCompare([]byte(t), []byte(s.Admin)) == 1
}
func reply(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	d := json.NewDecoder(r.Body)
	if d.Decode(v) != nil {
		fail(w, 400, "Неверный формат запроса")
		return false
	}
	return true
}
func (s *Server) save() error {
	a := []diskTicket{}
	for _, t := range s.Tickets {
		a = append(a, diskTicket{*t, t.Owner})
	}
	b, e := json.MarshalIndent(a, "", "  ")
	if e != nil {
		return e
	}
	if e = os.MkdirAll(filepath.Dir(s.File), 0700); e != nil {
		return e
	}
	if e = os.WriteFile(s.File+".tmp", b, 0600); e != nil {
		return e
	}
	return os.Rename(s.File+".tmp", s.File)
}
func (s *Server) handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("/api/", s.api)
	m.Handle("/", http.FileServer(http.Dir("../dist")))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.Method != "GET" {
			o := r.Header.Get("Origin")
			if o != "" && o != "http://"+r.Host && o != "https://"+r.Host && o != os.Getenv("MGLA_ALLOWED_ORIGIN") {
				fail(w, 403, "Недопустимый источник")
				return
			}
		}
		m.ServeHTTP(w, r)
	})
}
func (s *Server) api(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/"), "/")
	token := bearer(r)
	owner := hash(token)
	isAdmin := s.admin(r)
	if p == "health" && r.Method == "GET" {
		reply(w, map[string]any{"ok": true, "name": "Mgła"})
		return
	}
	if p == "session" && r.Method == "POST" {
		reply(w, map[string]string{"token": random(32)})
		return
	}
	if len(token) < 32 {
		fail(w, 401, "Нужен ключ доступа")
		return
	}
	if p == "presence" {
		id := owner[:12]
		if r.Method == "POST" {
			s.Peers[id] = time.Now()
		} else if r.Method == "DELETE" {
			delete(s.Peers, id)
		} else if r.Method != "GET" {
			fail(w, 405, "Метод недоступен")
			return
		}
		peers := []Peer{}
		for k, t := range s.Peers {
			if time.Since(t) > 20*time.Second {
				delete(s.Peers, k)
			} else {
				peers = append(peers, Peer{k, t})
			}
		}
		reply(w, map[string]any{"id": id, "peers": peers})
		return
	}
	if p == "admin" && r.Method == "GET" {
		if !isAdmin {
			fail(w, 403, "Неверный ключ разработчика")
			return
		}
		reply(w, map[string]bool{"ok": true})
		return
	}
	if p == "tickets" {
		if r.Method == "GET" {
			a := []*Ticket{}
			for _, t := range s.Tickets {
				if t.Owner == owner || isAdmin {
					a = append(a, t)
				}
			}
			reply(w, a)
			return
		}
		if r.Method == "POST" {
			var in struct{ Subject, Category, Text string }
			if !decode(w, r, &in) {
				return
			}
			in.Subject = strings.TrimSpace(in.Subject)
			in.Text = strings.TrimSpace(in.Text)
			if len(in.Subject) < 3 || len(in.Subject) > 240 || len(in.Text) < 5 || len(in.Text) > 10000 {
				fail(w, 400, "Укажите тему и описание (до 10 000 символов)")
				return
			}
			count := 0
			for _, t := range s.Tickets {
				if t.Owner == owner {
					count++
				}
			}
			if count >= 100 {
				fail(w, 429, "Лимит: 100 обращений на ключ")
				return
			}
			t := &Ticket{ID: random(6), Owner: owner, Subject: in.Subject, Category: in.Category, Status: "open", Messages: []Message{{"user", in.Text, time.Now()}}, Updated: time.Now()}
			s.Tickets[t.ID] = t
			if e := s.save(); e != nil {
				delete(s.Tickets, t.ID)
				fail(w, 500, "Не удалось сохранить обращение")
				return
			}
			reply(w, t)
			return
		}
	}
	if strings.HasPrefix(p, "tickets/") {
		id := strings.TrimPrefix(p, "tickets/")
		t, ok := s.Tickets[id]
		if !ok || (!isAdmin && t.Owner != owner) {
			fail(w, 404, "Обращение не найдено")
			return
		}
		if r.Method == "GET" {
			reply(w, t)
			return
		}
		if r.Method == "PATCH" {
			var in struct {
				Text, Status string
				Rating       int
			}
			if !decode(w, r, &in) {
				return
			}
			old := *t
			old.Messages = append([]Message(nil), t.Messages...)
			if in.Text != "" {
				if len(strings.TrimSpace(in.Text)) == 0 || len(in.Text) > 10000 {
					fail(w, 400, "Некорректное сообщение")
					return
				}
				author := "user"
				if isAdmin {
					author = "developer"
				}
				t.Messages = append(t.Messages, Message{author, in.Text, time.Now()})
				if isAdmin {
					t.Status = "answered"
				} else {
					t.Status = "open"
				}
			}
			if in.Status != "" {
				if in.Status != "closed" && in.Status != "open" && !(isAdmin && in.Status == "progress") {
					fail(w, 400, "Некорректный статус")
					*t = old
					return
				}
				t.Status = in.Status
			}
			if in.Rating >= 1 && in.Rating <= 5 {
				t.Rating = in.Rating
			}
			t.Updated = time.Now()
			if e := s.save(); e != nil {
				*t = old
				fail(w, 500, "Не удалось сохранить ответ")
				return
			}
			reply(w, t)
			return
		}
	}
	if strings.HasPrefix(p, "rooms/") {
		for roomCode, existing := range s.Rooms {
			for member, seen := range existing.Members {
				if time.Since(seen) > 5*time.Minute {
					delete(existing.Members, member)
					s.NextGeneration++
					existing.Generation = s.NextGeneration
					existing.Signals = nil
				}
			}
			if len(existing.Members) == 0 {
				delete(s.Rooms, roomCode)
			}
		}
		code := strings.TrimPrefix(p, "rooms/")
		if len(code) != 32 {
			fail(w, 400, "Неверный код комнаты")
			return
		}
		if _, err := hex.DecodeString(code); err != nil {
			fail(w, 400, "Неверный код комнаты")
			return
		}
		id := owner[:12]
		room := s.Rooms[code]
		if room == nil {
			if r.Method != "POST" {
				reply(w, map[string]any{"members": []string{}, "signals": []Signal{}})
				return
			}
			if len(s.Rooms) >= 1000 {
				fail(w, 429, "Слишком много комнат")
				return
			}
			room = &Room{Members: map[string]time.Time{}}
			s.Rooms[code] = room
		}
		for k, t := range room.Members {
			if time.Since(t) > 5*time.Minute {
				delete(room.Members, k)
			}
		}
		if r.Method == "DELETE" {
			delete(room.Members, id)
			s.NextGeneration++
			room.Generation = s.NextGeneration
			room.Signals = nil
			if len(room.Members) == 0 {
				delete(s.Rooms, code)
			}
			reply(w, map[string]bool{"ok": true})
			return
		}
		if r.Method == "POST" {
			if _, ok := room.Members[id]; !ok && len(room.Members) >= 2 {
				fail(w, 409, "В комнате уже два участника")
				return
			}
			if _, exists := room.Members[id]; !exists {
				s.NextGeneration++
				room.Generation = s.NextGeneration
				room.Signals = nil
			}
			room.Members[id] = time.Now()
			var in struct {
				To         string
				Generation int
				Data       json.RawMessage
			}
			if !decode(w, r, &in) {
				return
			}
			if len(in.Data) > 0 {
				if in.Generation != room.Generation {
					fail(w, 409, "Состав комнаты изменился, повторите соединение")
					return
				}
				if _, ok := room.Members[in.To]; !ok {
					fail(w, 400, "Участник отключился")
					return
				}
				room.Seq++
				room.Signals = append(room.Signals, Signal{room.Seq, id, in.To, in.Data})
				if len(room.Signals) > 100 {
					room.Signals = room.Signals[len(room.Signals)-100:]
				}
			}
		} else if r.Method != "GET" {
			fail(w, 405, "Метод недоступен")
			return
		}
		if _, ok := room.Members[id]; !ok {
			fail(w, 403, "Сначала войдите в комнату")
			return
		}
		members := []string{}
		signals := []Signal{}
		for k := range room.Members {
			members = append(members, k)
		}
		for _, v := range room.Signals {
			if v.To == id {
				signals = append(signals, v)
			}
		}
		reply(w, map[string]any{"members": members, "signals": signals, "id": id, "generation": room.Generation})
		return
	}
	fail(w, 404, "Не найдено")
}
func main() {
	s := &Server{Tickets: map[string]*Ticket{}, Peers: map[string]time.Time{}, Rooms: map[string]*Room{}, File: "data/tickets.json", Admin: os.Getenv("MGLA_ADMIN_TOKEN")}
	if b, e := os.ReadFile(s.File); e == nil {
		var a []diskTicket
		if json.Unmarshal(b, &a) != nil {
			log.Fatal("Invalid ticket data")
		}
		for _, v := range a {
			t := v.Ticket
			t.Owner = v.OwnerHash
			s.Tickets[t.ID] = &t
		}
	} else if !errors.Is(e, os.ErrNotExist) {
		log.Fatal(e)
	}
	if s.Admin != "" && len(s.Admin) < 32 {
		log.Fatal("MGLA_ADMIN_TOKEN must contain at least 32 characters")
	}
	addr := os.Getenv("MGLA_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8089"
	}
	log.Printf("Mgła listening on %s", addr)
	srv := &http.Server{Addr: addr, Handler: s.handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
