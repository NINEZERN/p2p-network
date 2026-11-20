package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T) *Server {
	return &Server{Tickets: map[string]*Ticket{}, Peers: map[string]time.Time{}, Rooms: map[string]*Room{}, File: filepath.Join(t.TempDir(), "tickets.json"), Admin: strings.Repeat("d", 64)}
}
func request(s *Server, method, path, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/"+path, strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	s.handler().ServeHTTP(w, r)
	return w
}
func TestTicketLifecycleAndIsolation(t *testing.T) {
	s := testServer(t)
	a := strings.Repeat("a", 64)
	b := strings.Repeat("b", 64)
	w := request(s, "POST", "tickets", a, `{"subject":"Не работает подключение","category":"Техническая проблема","text":"После подключения возникает ошибка"}`)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var ticket Ticket
	json.Unmarshal(w.Body.Bytes(), &ticket)
	path := "tickets/" + ticket.ID
	if request(s, "GET", path, b, "").Code != 404 {
		t.Fatal("cross-user ticket access")
	}
	if request(s, "PATCH", path, b, `{"text":"secret"}`).Code != 404 {
		t.Fatal("cross-user ticket mutation")
	}
	if w = request(s, "GET", "tickets", b, ""); strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal("ticket list leak")
	}
	for _, step := range []struct{ token, body, status string }{{s.Admin, `{"status":"progress"}`, "progress"}, {s.Admin, `{"text":"Проверьте настройки сети"}`, "answered"}, {a, `{"status":"closed","rating":5}`, "closed"}, {a, `{"status":"open"}`, "open"}} {
		w = request(s, "PATCH", path, step.token, step.body)
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		json.Unmarshal(w.Body.Bytes(), &ticket)
		if ticket.Status != step.status {
			t.Fatal(ticket.Status)
		}
	}
	if ticket.Rating != 5 || len(ticket.Messages) != 2 {
		t.Fatal("lost history")
	}
	data, err := os.ReadFile(s.File)
	if err != nil || !json.Valid(data) {
		t.Fatal("missing persistence")
	}
	if strings.Contains(string(data), a) {
		t.Fatal("raw key persisted")
	}
	if strings.Contains(w.Body.String(), "ownerHash") {
		t.Fatal("owner exposed")
	}
}
func TestAuthAndValidation(t *testing.T) {
	s := testServer(t)
	a := strings.Repeat("a", 64)
	if request(s, "GET", "tickets", "", "").Code != 401 {
		t.Fatal("auth required")
	}
	if request(s, "GET", "admin", a, "").Code != 403 {
		t.Fatal("admin auth")
	}
	if request(s, "POST", "tickets", a, `{"subject":"a","text":"b"}`).Code != 400 {
		t.Fatal("validation")
	}
	r := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(`{}`))
	r.Header.Set("Origin", "https://other.example")
	w := httptest.NewRecorder()
	s.handler().ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("origin check")
	}
}
func TestRoomSignaling(t *testing.T) {
	s := testServer(t)
	a := strings.Repeat("a", 64)
	b := strings.Repeat("b", 64)
	c := strings.Repeat("c", 64)
	room := "rooms/" + strings.Repeat("f", 32)
	if request(s, "POST", room, a, `{}`).Code != 200 || request(s, "POST", room, b, `{}`).Code != 200 {
		t.Fatal("join")
	}
	if request(s, "POST", room, c, `{}`).Code != 410 {
		t.Fatal("room code should be single-use")
	}
	body := `{"generation":2,"to":"` + hash(b)[:12] + `","data":{"description":{"type":"offer","sdp":"test"}}}`
	if request(s, "POST", room, a, body).Code != 200 {
		t.Fatal("signal")
	}
	w := request(s, "GET", room, b, "")
	if !strings.Contains(w.Body.String(), "offer") {
		t.Fatal("missing signal")
	}
	w = request(s, "GET", room, a, "")
	if strings.Contains(w.Body.String(), "offer") {
		t.Fatal("signal leaked to sender")
	}
	if request(s, "GET", room, c, "").Code != 403 {
		t.Fatal("room isolation")
	}
	request(s, "DELETE", room, a, "")
	if request(s, "POST", room, c, `{}`).Code != 410 {
		t.Fatal("used room accepted a new participant")
	}
	request(s, "DELETE", room, b, "")
	if request(s, "POST", room, c, `{}`).Code != 200 {
		t.Fatal("room should be reusable after both participants leave")
	}
}
func TestPersistenceFailureIsRolledBack(t *testing.T) {
	s := testServer(t)
	s.File = "/dev/null/impossible"
	w := request(s, "POST", "tickets", strings.Repeat("a", 64), `{"subject":"Test","text":"More details"}`)
	if w.Code != 500 || len(s.Tickets) != 0 {
		t.Fatal("failed writes must not appear successful")
	}
}

func TestRoomRejoinInvalidatesOldSignals(t *testing.T) {
	s := testServer(t)
	a := strings.Repeat("a", 64)
	b := strings.Repeat("b", 64)
	room := "rooms/" + strings.Repeat("e", 32)
	request(s, "POST", room, a, `{}`)
	request(s, "POST", room, b, `{}`)
	signal := `{"generation":2,"to":"` + hash(b)[:12] + `","data":{"description":{"type":"offer","sdp":"old"}}}`
	if request(s, "POST", room, a, signal).Code != 200 {
		t.Fatal("initial signal")
	}
	request(s, "DELETE", room, b, "")
	request(s, "POST", room, b, `{}`)
	if request(s, "POST", room, a, signal).Code != 409 {
		t.Fatal("stale signal accepted")
	}
	w := request(s, "GET", room, b, "")
	if strings.Contains(w.Body.String(), "old") {
		t.Fatal("old SDP survived rejoin")
	}
}
