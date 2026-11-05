import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioLines, LayoutDashboard, Network, MessageSquare, FolderUp, LifeBuoy, Settings, ArrowUpRight, ArrowRight, Check, ChevronRight, Shield, ShieldCheck, Lock, Copy, Plus, Search, X, Send, Download, Power, Globe, Activity, CheckCircle2, AlertCircle, BookOpen, ExternalLink, RefreshCw, KeyRound, ChevronDown, Star, Menu, LogOut } from 'lucide-react';
import { api, post } from './api';
import { usePeer } from './usePeer';
import './style.css';
import { LanguageProvider, useLanguage } from './i18n';
const nav = [['Обзор', LayoutDashboard], ['Сеть узлов', Network], ['Сообщения', MessageSquare], ['Файлы', FolderUp], ['Поддержка', LifeBuoy], ['Настройки', Settings]];
const labels = {
  open: 'Открыт',
  progress: 'В работе',
  answered: 'Есть ответ',
  closed: 'Закрыт'
};
function App() {
  const {
    t,
    language,
    setLanguage,
    locale
  } = useLanguage();
  const translate = t;
  const [page, setPage] = useState('Обзор'),
    [key, setKey] = useState(localStorage.getItem('mgla-key') || ''),
    [online, setOnline] = useState(false),
    [peers, setPeers] = useState([]),
    [id, setId] = useState(''),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState(null),
    [tickets, setTickets] = useState([]),
    [selected, setSelected] = useState(null),
    [room, setRoom] = useState(''),
    [roomInput, setRoomInput] = useState(''),
    [consent, setConsent] = useState(false),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [admin, setAdmin] = useState(''),
    [adminInput, setAdminInput] = useState(''),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [started, setStarted] = useState(null),
    [elapsed, setElapsed] = useState(0),
    [draft, setDraft] = useState(''),
    [sending, setSending] = useState(false);
  const alert = useCallback(msg => setError(msg), []);
  const peer = usePeer(room, online, alert);
  const fileRef = useRef(),
    dialogRef = useRef(),
    previousFocus = useRef();
  useEffect(() => {
    if (!modal) return;
    previousFocus.current = document.activeElement;
    const el = dialogRef.current;
    el?.querySelector('input,button,textarea')?.focus();
    const handler = e => {
      if (e.key === 'Escape') setModal(null);
      if (e.key === 'Tab') {
        const nodes = [...el.querySelectorAll('button,input,textarea,select,a[href]')].filter(v => !v.disabled);
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previousFocus.current?.focus();
    };
  }, [modal]);
  useEffect(() => {
    let alive = true;
    if (key) crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)).then(v => {
      if (alive) setId(Array.from(new Uint8Array(v), b => b.toString(16).padStart(2, '0')).join('').slice(0, 12));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  useEffect(() => {
    if (!key) api('session', post({})).then(d => {
      localStorage.setItem('mgla-key', d.token);
      setKey(d.token);
    }).catch(e => setError(e.message));
  }, [key]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const load = useCallback(async () => {
    if (!key) return;
    try {
      setTickets(await api('tickets', {}, admin || key));
    } catch (e) {
      setError(e.message);
    }
  }, [key, admin]);
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!online || !key) return;
    let alive = true;
    const tick = () => api('presence', post({})).then(d => {
      if (alive) {
        setPeers(d.peers);
        setId(d.id);
      }
    }).catch(e => {
      if (alive) {
        setError(e.message);
        setOnline(false);
      }
    });
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
      api('presence', {
        method: 'DELETE'
      }).catch(() => {});
    };
  }, [online, key]);
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [started]);
  const current = tickets.find(t => t.id === selected);
  const notify = m => setToast(m);
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify('Скопировано');
    } catch {
      setError('Не удалось скопировать. Выделите текст вручную.');
    }
  }
  async function connect() {
    if (online) {
      setOnline(false);
      setRoom('');
      setPeers([]);
      setStarted(null);
      setElapsed(0);
      return;
    }
    setBusy(true);
    try {
      const d = await api('presence', post({}));
      setId(d.id);
      setPeers(d.peers);
      setOnline(true);
      setStarted(Date.now());
      notify('Вы подключены к сервису обнаружения');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function createTicket(e) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const t = await api('tickets', post(Object.fromEntries(f)));
      setModal(null);
      await load();
      setSelected(t.id);
      setPage('Поддержка');
      notify('Обращение создано. Сохраните ключ доступа в настройках.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function updateTicket(body) {
    try {
      await api('tickets/' + selected, {
        method: 'PATCH',
        body: JSON.stringify(body)
      }, admin || key);
      await load();
      notify('Обращение обновлено');
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }
  function join(create) {
    if (!online) {
      setError('Сначала подключитесь к сети на странице «Обзор».');
      return;
    }
    if (!consent) {
      setError('Подтвердите, что понимаете особенности прямого соединения.');
      return;
    }
    const code = create ? Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('') : roomInput.trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(code)) {
      setError('Код комнаты должен содержать 32 символа.');
      return;
    }
    setRoom(code);
    setModal(null);
    setPage('Сообщения');
  }
  const uptime = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  const heading = {
    Обзор: ['Ваше пространство. Ваши правила.', 'Общайтесь и делитесь файлами без регистрации и личных данных.'],
    'Сеть узлов': ['Сеть узлов', 'Участники, доступные через этот сервер обнаружения.'],
    Сообщения: ['Сообщения', 'Личный диалог через зашифрованный P2P-канал.'],
    Файлы: ['Передача файлов', 'Отправляйте файлы напрямую собеседнику, до 5 МБ.'],
    Поддержка: ['Мы на связи', 'Задайте вопрос, сообщите об ошибке или предложите идею.'],
    Настройки: ['Настройки', 'Управляйте своим доступом и приватностью.']
  }[page];
  return <div className="app"><aside className={mobile ? 'sidebar shown' : 'sidebar'}><a className="brand" href="#" onClick={e => {
        e.preventDefault();
        setPage('Обзор');
      }}><span className="brand-icon"><AudioLines /></span><b>mgła<span className="brand-dot">.</span></b><span className="beta">BETA</span></a><div className="workspace"><span className="avatar">M</span><div>{t("Личное пространство")}<small>{t("Анонимный участник")}</small></div><Lock size={13} /></div><div className="nav-caption">{t("ПРОСТРАНСТВО")}</div><nav>{nav.map(([name, Icon]) => <button key={name} className={page === name ? 'nav-item active' : 'nav-item'} onClick={() => {
          setPage(name);
          setMobile(false);
          setSearch('');
        }}><Icon size={19} /><span>{t(name)}</span>{name === 'Поддержка' && tickets.some(t => t.status === 'answered') && <span className="count">{tickets.filter(t => t.status === 'answered').length}</span>}{name === page && <span className="nav-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={23} /><strong>{t("Меньше данных.")}<br />{t("Больше свободы.")}</strong><p>{t("Никакой регистрации.")}<br />{t("Никаких рекламных трекеров.")}</p><button onClick={() => setModal('privacy')}>{t("О приватности ")}<ArrowUpRight size={14} /></button></div><div className="profile"><span className="avatar small">{id ? id.slice(0, 2).toUpperCase() : '…'}</span><div>{t("Участник #")}{id.slice(0, 6) || '…'}<small><i className={online ? 'dot green' : 'dot'} />{online ? t('В сети') : t('Не подключён')}</small></div><button className="icon-button" aria-label={t("Настройки участника")} onClick={() => setPage('Настройки')}><Settings size={17} /></button></div><div className="version">Mgła v1.0.0 <span>{t("Сделано для свободы ↗")}</span></div></div></aside>
 <div className="shell"><header><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label={t("Открыть меню")} onClick={() => setMobile(!mobile)}><Menu /></button><span>{t("Пространство")}</span><ChevronRight size={14} /><b>{t(page)}</b></div><div className="header-right"><label className="language-switch"><Globe size={15} aria-hidden="true" /><select aria-label={t('Язык интерфейса')} value={language} onChange={e => setLanguage(e.target.value)}><option value="en" lang="en">English</option><option value="pl" lang="pl">Polski</option><option value="ru" lang="ru">Русский</option></select></label><span className="header-status"><i className={online ? 'dot green' : 'dot'} />{online ? t('Сервис доступен') : t('Не подключено')}</span><span className="header-divider" /><button className="help-button" onClick={() => setPage('Поддержка')}><LifeBuoy size={17} />{t(" Центр помощи ")}<ArrowUpRight size={13} /></button></div></header>
 <main><div className="page-title"><div><div className="eyebrow">{page === 'Обзор' ? t('ПРИВАТНОСТЬ НАЧИНАЕТСЯ ЗДЕСЬ') : 'M G Ł A / ' + t(page).toLocaleUpperCase(locale)}</div><h1>{t(heading[0])}</h1><p>{t(heading[1])}</p></div><span className="date">{new Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            }).format(new Date())}</span></div>
 {error && <div className="error" role="alert"><AlertCircle size={18} /><span>{t(error)}</span>{!key && <button className="button secondary" onClick={async () => {
            try {
              const d = await api('session', post({}));
              localStorage.setItem('mgla-key', d.token);
              setKey(d.token);
              setError('');
            } catch (e) {
              setError(e.message);
            }
          }}>{t("Повторить")}</button>}<button className="icon-button" aria-label={t("Скрыть ошибку")} onClick={() => setError('')}><X size={16} /></button></div>}
 {page === 'Обзор' && <><div className="overview-grid"><section className="connection panel"><div className="section-heading"><h2>{t("Подключение к сети")}</h2><span className={'badge ' + (online ? 'success' : 'neutral')}><i className={online ? 'dot green' : 'dot'} />{online ? t('Подключено') : t('Не подключено')}</span></div><div className={'connection-core ' + (online ? 'is-online' : '')}><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><span className="orbit-point p1" /><span className="orbit-point p2" /><span className="orbit-point p3" /><button className="power" aria-label={online ? t('Отключиться от сети') : t('Подключиться к сети')} onClick={connect} disabled={busy || !key}><Power size={34} /></button></div><div className="connection-copy"><h3>{online ? t('Вы в своём пространстве') : t('Один шаг до подключения')}</h3><p>{online ? t('Создайте приватную комнату и пригласите собеседника.') : t('Подключитесь, чтобы начать общение без регистрации.')}</p><button className={online ? 'button secondary' : 'button primary'} onClick={connect} disabled={busy || !key}>{busy ? t('Подключаемся…') : online ? t('Отключиться') : t('Подключиться к сети')}<ArrowRight size={16} /></button><span className="connection-foot"><Lock size={12} />{online ? t('Сообщения передаются только после входа в комнату') : t('Без email, имени и номера телефона')}</span></div><div className="connection-stats"><div><span>{t("Сессия")}</span><strong>{online ? uptime : '—'}</strong></div><div><span>{t("Участники")}</span><strong>{online ? peers.length : '—'}</strong></div><div><span>{t("Канал P2P")}</span><strong className={peer.state === 'connected' ? 'mint' : ''}>{peer.state === 'connected' ? t('Открыт') : t('Не открыт')}</strong></div></div></section>
 <div className="right-stack"><section className="identity panel"><div className="section-heading"><h2>{t("Ваша приватность")}</h2><ShieldCheck size={20} className="purple" /></div><div className="privacy-level"><span className="shield-tile"><Shield size={24} /></span><div><strong>{t("Без личных данных")}</strong><small>{t("Анонимный идентификатор")}</small></div><span className="tiny-tag">ON</span></div><div className="identity-row"><span>{t("Ваш ID")}</span><button onClick={() => copy(id)}>#{id || '…'}<Copy size={13} /></button></div><div className="identity-row"><span>{t("Регистрация")}</span><b>{t("Не требуется ")}<Check size={14} /></b></div><div className="identity-row"><span>{t("Сторонние трекеры")}</span><b>{t("Отсутствуют ")}<Check size={14} /></b></div><button className="text-link" onClick={() => setModal('privacy')}>{t("Как устроена приватность ")}<ArrowUpRight size={14} /></button></section><section className="quick-start panel"><span className="mini-label">{t("ПЕРВЫЕ ШАГИ")}</span><h2>{t("Связь без лишних шагов")}</h2>{[['Подключитесь к сети', online], ['Создайте приватную комнату', !!room], ['Пригласите собеседника', peer.state === 'connected']].map(([s, done], i) => <div className="step" key={t(s)}><span className={done ? 'step-number done' : 'step-number'}>{done ? <Check size={12} /> : i + 1}</span><span>{t(s)}</span>{done && <Check size={14} className="mint" />}</div>)}<button className="text-link" onClick={() => setModal('room')}>{t("Создать комнату ")}<ArrowRight size={15} /></button></section></div></div>
 <div className="section-label"><h2>{t("Что вы хотите сделать?")}</h2><span>{t("Всё необходимое — под рукой")}</span></div><div className="action-grid">{[[MessageSquare, 'Начать разговор', 'Приватный диалог по коду комнаты.', 'Сообщения'], [FolderUp, 'Передать файл', 'Напрямую, без хранения на сервере.', 'Файлы'], [LifeBuoy, 'Получить помощь', 'Вопросы и идеи — анонимно.', 'Поддержка']].map(([Icon, title, text, target], i) => <button className="action-card panel" key={title} onClick={() => setPage(target)}><span className={'action-icon icon-' + i}><Icon size={22} /></span><ArrowUpRight className="card-arrow" size={19} /><h3>{t(title)}</h3><p>{t(text)}</p></button>)}</div><div className="bottom-grid"><section className="news panel"><div className="section-heading"><h2><span className="dot purple-bg" />{t(" Новости проекта")}</h2><span className="mini-label">{t("ОБНОВЛЕНИЕ 1.0")}</span></div><div className="news-content"><span className="news-date">05<br /><small>{t("НОЯ")}</small></span><div><h3>{t("Приватное общение стало проще")}</h3><p>{t("Комнаты по приглашению, прямой обмен файлами и поддержка без email — в одном пространстве.")}</p></div><button className="icon-button" aria-label={t("Открыть описание обновления")} onClick={() => setModal('news')}><ArrowUpRight size={20} /></button></div></section><section className="feedback panel"><span className="feedback-icon"><MessageSquare size={25} /></span><div><h3>{t("Ваш голос меняет Mgła")}</h3><p>{t("Есть идея? Помогите сделать сеть удобнее.")}</p><button className="text-link" onClick={() => setModal('ticket')}>{t("Предложить улучшение ")}<ArrowRight size={14} /></button></div></section></div></>}
 {page === 'Сеть узлов' && <section className="panel padded"><div className="section-heading"><h2>{t("Доступные участники ")}<span className="number-tag">{peers.length}</span></h2><button className="button secondary" onClick={connect}>{online ? t('Отключиться') : t('Подключиться')}</button></div><div className="info"><Shield size={18} />{t("Список содержит случайные ID. Маршрутизация через анонимизирующие узлы в этой версии не реализована.")}</div>{!peers.length ? <Empty icon={Network} title={t("Вы пока вне сети")} text={t("Подключитесь, затем откройте сайт в другом браузере — второй участник появится здесь.")} /> : <div className="table-wrap"><table><thead><tr><th>{t("Участник")}</th><th>{t("Тип соединения")}</th><th>{t("Статус")}</th><th>{t("Последняя активность")}</th></tr></thead><tbody>{peers.map(p => <tr key={p.id}><td><span className="node-mark"><Network size={16} /></span>#{p.id} {p.id === id && <span className="mini-label">{t("ВЫ")}</span>}</td><td>{t("Обнаружение через Go API")}</td><td><span className="badge success">{t("В сети")}</span></td><td>{new Date(p.seen).toLocaleTimeString(locale)}</td></tr>)}</tbody></table></div>}<button className="button primary" onClick={() => setModal('room')}>{t("Создать приватную комнату ")}<Plus size={16} /></button></section>}
 {['Сообщения', 'Файлы'].includes(page) && <><div className="room-toolbar panel"><div><span className={'badge ' + (peer.state === 'connected' ? 'success' : 'neutral')}>{{
                  idle: t('Нет комнаты'),
                  waiting: t('Ожидаем собеседника'),
                  connecting: t('Устанавливаем P2P-канал'),
                  connected: t('P2P-канал открыт'),
                  disconnected: t('Соединение прервано'),
                  error: t('Ошибка соединения')
                }[peer.state]}</span>{room && <button className="room-code" onClick={() => copy(room)} title={t("Скопировать код комнаты")}>{room}<Copy size={14} /></button>}</div><div className="button-row">{room && <button className="button secondary" onClick={() => {
                setRoom('');
                notify('Вы вышли из комнаты');
              }}>{t("Выйти")}</button>}<button className="button primary" onClick={() => setModal('room')}><Plus size={16} />{t(" Комната")}</button></div></div>{peer.state === 'connecting' && <div className="info"><Activity size={18} />{t("Для работы через интернет настройте STUN/TURN. По умолчанию поддерживается прямая связь в локальной сети.")}</div>}{page === 'Сообщения' ? <section className="panel chat"><div className="chat-body">{!peer.messages.length ? <Empty icon={MessageSquare} title={room ? t('Здесь начинается ваш разговор') : t('Разговор только для вас двоих')} text={room ? t('Передайте код комнаты собеседнику другим способом. Сообщения исчезнут после выхода.') : t('Создайте комнату или войдите по коду. История не сохраняется на сервере.')} action={!room && <button className="button primary" onClick={() => setModal('room')}>{t("Создать или войти ")}<ArrowRight size={16} /></button>} /> : peer.messages.map(m => <div key={m.id} className={'chat-message ' + (m.own ? 'own' : '')}><small>{m.own ? t('Вы') : t('Собеседник')} · {new Date(m.at).toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</small><p>{m.text}</p></div>)}</div><form className="composer" onSubmit={e => {
              e.preventDefault();
              try {
                peer.send(draft.trim());
                setDraft('');
              } catch (e) {
                setError(e.message);
              }
            }}><input aria-label={t("Сообщение собеседнику")} placeholder={peer.state === 'connected' ? t('Напишите сообщение…') : t('Ожидаем прямое соединение…')} value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000} disabled={peer.state !== 'connected'} /><button className="button primary" disabled={!draft.trim() || peer.state !== 'connected'} aria-label={t("Отправить сообщение")}><Send size={18} /></button></form><p className="chat-hint"><Lock size={12} />{t(" WebRTC шифрует канал. Сервер не получает текст сообщений.")}</p></section> : <section className="panel padded"><input ref={fileRef} type="file" hidden onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              setSending(true);
              try {
                await peer.sendFile(f);
                notify('Файл отправлен в P2P-канал');
              } catch (e) {
                setError(e.message);
              } finally {
                setSending(false);
                e.target.value = '';
              }
            }} /><div className="file-drop"><FolderUp size={40} /><h2>{t("Отправить файл собеседнику")}</h2><p>{t("До 5 МБ · напрямую через WebRTC · без загрузки на сервер")}</p><button className="button primary" disabled={peer.state !== 'connected' || sending} onClick={() => fileRef.current.click()}>{sending ? t('Передаём…') : t('Выбрать файл')}<Plus size={16} /></button>{peer.state !== 'connected' && <small>{t("Сначала соедините два браузера в одной комнате.")}</small>}</div>{peer.files.map((f, i) => <div className="file-row" key={i}><FolderUp size={20} /><div><strong>{f.name}</strong><small>{(f.size / 1024).toFixed(1)}{t(" КБ · ")}{f.own ? t('Отправлен') : t('Получен')}</small></div>{!f.own && <button className="button secondary" onClick={() => {
                const url = URL.createObjectURL(f.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = f.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}><Download size={16} />{t(" Скачать")}</button>}</div>)}</section>}</>}
 {page === 'Поддержка' && <><div className="support-cards">{[[LifeBuoy, 'Обращение в поддержку', 'Техническая проблема или вопрос'], [MessageSquare, 'Предложить идею', 'Сделаем Mgła удобнее вместе'], [BookOpen, 'Ответы на вопросы', 'Быстрая помощь без ожидания']].map(([Icon, title, text], i) => <button className="panel support-card" key={title} onClick={() => setModal(i === 2 ? 'faq' : 'ticket')}><Icon size={24} className="purple" /><h3>{t(title)}</h3><p>{t(text)}</p><ArrowUpRight size={17} /></button>)}</div><section className="panel padded"><div className="section-heading"><div><h2>{admin ? t('Кабинет разработчика') : t('Мои обращения')} <span className="number-tag">{tickets.length}</span></h2><p className="subtext">{admin ? t('Ответы, статусы и история переписки с пользователями.') : t('Ответы доступны здесь по вашему ключу — email не нужен.')}</p></div><div className="button-row">{admin && <button className="button secondary" onClick={() => {
                  setAdmin('');
                  setSelected(null);
                }}><LogOut size={15} />{t("Выйти")}</button>}<button className="button primary" onClick={() => setModal('ticket')}><Plus size={16} />{t("Создать тикет")}</button></div></div><div className="filters"><label className="search"><Search size={17} /><input placeholder={t("Поиск по теме…")} value={search} onChange={e => setSearch(e.target.value)} aria-label={t("Поиск обращений")} /></label><select aria-label={t("Статус обращения")} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("Все статусы")}</option>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select><button className="icon-button" aria-label={t("Обновить обращения")} onClick={load}><RefreshCw size={17} /></button></div>{!tickets.length ? <Empty icon={LifeBuoy} title={t("Пока ни одного обращения")} text={t("Расскажите о проблеме или предложите улучшение. Разработчик сможет ответить в этом же тикете.")} /> : <div className="ticket-layout"><div className="ticket-list">{!tickets.some(t => (filter === 'all' || filter === t.status) && t.subject.toLowerCase().includes(search.toLowerCase())) && <p className="subtext">{t("По вашему запросу ничего не найдено.")}</p>}{tickets.filter(t => (filter === 'all' || filter === t.status) && t.subject.toLowerCase().includes(search.toLowerCase())).sort((a, b) => new Date(b.updated) - new Date(a.updated)).map(t => <button key={t.id} className={'ticket-item ' + (selected === t.id ? 'selected' : '')} onClick={() => setSelected(t.id)}><span><small>#{t.id.slice(0, 6)} · {translate(t.category)}</small><strong>{t.subject}</strong></span><span className={'badge ' + (t.status === 'answered' ? 'success' : 'neutral')}>{translate(labels[t.status])}</span></button>)}</div>{current ? <div className="ticket-thread"><div className="section-heading"><h3>{current.subject}</h3><button className="icon-button" aria-label={t("Закрыть переписку")} onClick={() => setSelected(null)}><X size={16} /></button></div>{current.messages.map((m, i) => <div className={'ticket-message ' + m.author} key={i}><small>{m.author === 'developer' ? t('Разработчик') : t('Пользователь')} · {new Date(m.at).toLocaleString(locale)}</small><p>{m.text}</p></div>)}<form className="reply-form" onSubmit={async e => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  setBusy(true);
                  const ok = await updateTicket({
                    text: new FormData(f).get('text')
                  });
                  setBusy(false);
                  if (ok) f.reset();
                }}><textarea name="text" required minLength={1} maxLength={10000} placeholder={t("Напишите ответ…")} aria-label={t("Ответ в тикете")} /><button className="button primary" disabled={busy}>{t("Отправить ")}<Send size={15} /></button></form><div className="button-row">{admin && <button className="button secondary" onClick={() => updateTicket({
                    status: 'progress'
                  })}>{t("Взять в работу")}</button>}<button className="button secondary" onClick={() => updateTicket({
                    status: current.status === 'closed' ? 'open' : 'closed'
                  })}>{current.status === 'closed' ? t('Открыть повторно') : t('Закрыть обращение')}</button></div>{current.status === 'closed' && !admin && <div className="rating"><span>{t("Оцените помощь")}</span>{[1, 2, 3, 4, 5].map(n => <button aria-label={t('Оценка ') + n} key={n} onClick={() => updateTicket({
                    rating: n
                  })}><Star size={20} fill={current.rating >= n ? '#a187ff' : 'none'} /></button>)}</div>}</div> : <div className="thread-placeholder"><MessageSquare size={28} /><p>{t("Выберите обращение,")}<br />{t("чтобы открыть переписку.")}</p></div>}</div>}</section><div className="support-foot"><Lock size={14} />{t(" Не включайте в обращение пароли и личные данные.")}<button onClick={() => setModal('admin')}>{t("Вход для разработчика ")}<ArrowUpRight size={13} /></button></div></>}
 {page === 'Настройки' && <div className="settings-grid"><section className="panel padded"><div className="section-heading"><h2><KeyRound size={19} />{t(" Ваш ключ доступа")}</h2><span className="badge success">{t("Без регистрации")}</span></div><p className="subtext">{t("Ключ открывает ваши обращения на другом устройстве. Сохраните его в надёжном месте: восстановление по email невозможно.")}</p><div className="secret">{key ? '•'.repeat(48) : t('Ключ ещё не создан')}</div><div className="button-row"><button className="button primary" onClick={() => copy(key)} disabled={!key}><Copy size={16} />{t("Скопировать ключ")}</button><button className="button secondary" onClick={() => setModal('restore')}>{t("Войти по ключу")}</button></div><div className="settings-divider" /><h2>{t("Приватность по умолчанию")}</h2>{[['Случайный идентификатор', 'Без имени, телефона и email'], ['Переписка в памяти браузера', 'Исчезает при выходе из комнаты'], ['Тикеты доступны по ключу', 'Содержимое хранится у сервиса поддержки'], ['Без аналитики и рекламы', 'Интерфейс не загружает сторонние шрифты']].map(([a, b]) => <div className="setting-row" key={a}><div><strong>{t(a)}</strong><small>{t(b)}</small></div><CheckCircle2 size={20} className="mint" /></div>)}<button className="text-link" onClick={() => setModal('privacy')}>{t("Подробнее о границах анонимности ")}<ArrowUpRight size={15} /></button></section><section className="panel padded settings-aside"><Shield size={36} className="purple" /><h2>{t("Вы контролируете доступ")}</h2><p>{t("Не передавайте ключ доступа собеседникам. Для приглашения нужен только отдельный код комнаты.")}</p><p>{t("Если устройство общее, завершите сессию: ключ будет удалён из этого браузера, а тикеты останутся доступны по сохранённому ключу.")}</p><button className="button secondary" onClick={() => setModal('logout')}>{t("Завершить сессию ")}<LogOut size={16} /></button></section></div>}
 <footer><span><AudioLines size={15} />{t(" Mgła — пространство без лишних следов.")}</span><div><span className="footer-dot" />{t("Учебный проект · Человек–компьютер")}<button onClick={() => setModal('privacy')}>{t("Приватность ")}<ArrowUpRight size={12} /></button></div></footer></main></div>
 {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{t(toast)}</div>}
 {modal && <div className="modal-backdrop" onClick={e => {
      if (e.target === e.currentTarget) setModal(null);
    }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialogRef}><button className="modal-close icon-button" aria-label={t("Закрыть окно")} onClick={() => setModal(null)}><X /></button>
 {error && <div className="error" role="alert"><AlertCircle size={16} /><span>{t(error)}</span><button className="icon-button" onClick={() => setError('')} aria-label={t("Скрыть ошибку")}><X size={14} /></button></div>}{modal === 'ticket' && <><span className="modal-icon"><LifeBuoy /></span><h2 id="modal-title">{t("Давайте разберёмся вместе")}</h2><p>{t("Обращение анонимно. Ответ появится в разделе поддержки.")}</p><form onSubmit={createTicket}><label>{t("Тип обращения")}<select name="category"><option value="Техническая проблема">{t("Техническая проблема")}</option><option value="Вопрос о работе сети">{t("Вопрос о работе сети")}</option><option value="Предложение">{t("Предложение")}</option><option value="Проблема доступности">{t("Проблема доступности")}</option><option value="Приватность и безопасность">{t("Приватность и безопасность")}</option><option value="Жалоба на злоупотребление">{t("Жалоба на злоупотребление")}</option><option value="Другое">{t("Другое")}</option></select></label><label>{t("Тема")}<input name="subject" required minLength={3} maxLength={120} placeholder={t("Что случилось или что можно улучшить?")} /></label><label>{t("Подробности")}<textarea name="text" required minLength={5} maxLength={10000} rows={5} placeholder={t("Опишите ситуацию, шаги и ожидаемый результат. Не указывайте личные данные.")} /></label><div className="info"><Lock size={17} />{t("Обращение доступно вам и разработчику. Сохраните свой ключ в настройках.")}</div><button className="button primary full" disabled={busy}>{busy ? t('Отправляем…') : t('Отправить обращение')}<Send size={16} /></button></form></>}
 {modal === 'room' && <><span className="modal-icon"><MessageSquare /></span><h2 id="modal-title">{t("Приватная комната")}</h2><p>{t("Создайте комнату для двоих или войдите по коду приглашения.")}</p><div className="info warning"><Shield size={20} /><span>{t("WebRTC шифрует сообщения, но прямое соединение может раскрыть IP собеседнику. Это не Tor. По умолчанию связь работает в локальной сети.")}</span></div><label className="checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />{t("Я понимаю особенности прямого соединения")}</label><button className="button primary full" onClick={() => join(true)} disabled={!consent || !online}><Plus size={16} />{t("Создать новую комнату")}</button><div className="or">{t("или войти по коду")}</div><label>{t("Код приглашения")}<input value={roomInput} maxLength={32} onChange={e => setRoomInput(e.target.value)} placeholder={t("32 символа из приглашения")} /></label><button className="button secondary full" onClick={() => join(false)} disabled={!consent || !online || !roomInput}>{t("Войти в комнату ")}<ArrowRight size={16} /></button>{!online && <p className="purple">{t("Сначала подключитесь к сети в разделе «Обзор».")}</p>}</>}
 {modal === 'privacy' && <><span className="modal-icon"><ShieldCheck /></span><h2 id="modal-title">{t("Приватность без обещаний лишнего")}</h2><p>{t("Mgła — учебный прототип P2P-приложения с псевдонимным доступом.")}</p><div className="explain"><h3>{t("Что скрыто")}</h3><p>{t("Регистрация не нужна. Сообщения и файлы идут по зашифрованному WebRTC-каналу и не сохраняются сервером. История диалога хранится только в памяти вкладки.")}</p><h3>{t("Что видно")}</h3><p>{t("Сервер и сетевой провайдер видят IP при соединении. Собеседник может узнать ваш IP через WebRTC. Onion routing и скрытие метаданных не реализованы.")}</p><h3>{t("Обратная связь")}</h3><p>{t("Тикеты и ответы сохраняются на сервере. Разработчик видит их текст, категорию и случайный номер. Не отправляйте секреты. Ключ доступа хранится в localStorage этого браузера.")}</p><h3>{t("Доступ")}</h3><p>{t("Ключ — единственный способ вернуться к своим тикетам. Для публичного использования необходим HTTPS; для работы через интернет могут потребоваться STUN/TURN.")}</p></div><button className="button primary full" onClick={() => setModal(null)}>{t("Понятно ")}<Check size={16} /></button></>}
 {modal === 'faq' && <><span className="modal-icon"><BookOpen /></span><h2 id="modal-title">{t("Ответы на вопросы")}</h2>{[['Как пригласить собеседника?', 'Подключитесь к сети, создайте комнату и отправьте её код собеседнику другим доверенным способом. Он должен открыть этот же сайт и войти по коду.'], ['Почему соединение не устанавливается?', 'По умолчанию настроена связь в локальной сети. Для интернета администратору нужны STUN/TURN; строгие NAT и межсетевые экраны могут блокировать прямое соединение.'], ['Как получить ответ разработчика?', 'Создайте тикет. Разработчик ответит из своего кабинета, а статус изменится на «Есть ответ». Список автоматически обновляется каждые 6 секунд.'], ['Как вернуться к обращению?', 'Скопируйте ключ в настройках. На другом устройстве выберите «Войти по ключу». Без ключа восстановить доступ нельзя.'], ['Как сообщить о проблеме доступности или злоупотреблении?', 'Выберите соответствующую категорию тикета. При необходимости можно дополнить обращение, закрыть его, открыть повторно и оценить помощь.']].map(([q, a]) => <details key={q}><summary>{t(q)}<ChevronDown size={16} /></summary><p>{t(a)}</p></details>)}<button className="button primary full" onClick={() => setModal('ticket')}>{t("Не нашли ответ? Создать тикет ")}<ArrowRight size={15} /></button></>}
 {modal === 'admin' && <><span className="modal-icon"><KeyRound /></span><h2 id="modal-title">{t("Кабинет разработчика")}</h2><p>{t("Для входа нужен серверный ключ MGLA_ADMIN_TOKEN.")}</p><form onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('admin', {}, adminInput);
              setAdmin(adminInput);
              setAdminInput('');
              setSelected(null);
              setModal(null);
              notify('Кабинет разработчика открыт');
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}><label>{t("Ключ разработчика")}<input type="password" required value={adminInput} onChange={e => setAdminInput(e.target.value)} autoComplete="off" /></label><button className="button primary full" disabled={busy}>{t("Войти ")}<ArrowRight size={16} /></button></form></>}
 {modal === 'restore' && <><h2 id="modal-title">{t("Войти по ключу")}</h2><p>{t("Текущая сессия будет заменена. Сохраните её ключ, если хотите вернуться к своим обращениям.")}</p><form onSubmit={e => {
            e.preventDefault();
            const token = new FormData(e.currentTarget).get('key').trim();
            if (!/^[a-f0-9]{64}$/.test(token)) {
              setError('Нужен ключ из 64 символов, сохранённый в настройках.');
              return;
            }
            localStorage.setItem('mgla-key', token);
            setKey(token);
            setOnline(false);
            setRoom('');
            setAdmin('');
            setSelected(null);
            setModal(null);
            notify('Ключ восстановлен');
          }}><label>{t("Ваш сохранённый ключ")}<input name="key" type="password" required autoComplete="off" /></label><button className="button primary full">{t("Открыть пространство ")}<ArrowRight size={16} /></button></form></>}
 {modal === 'logout' && <><h2 id="modal-title">{t("Завершить сессию?")}</h2><p>{t("Сохраните ключ в настройках, чтобы не потерять доступ к обращениям. Диалоги текущей комнаты исчезнут.")}</p><button className="button primary full" onClick={() => {
            localStorage.removeItem('mgla-key');
            setKey('');
            setOnline(false);
            setRoom('');
            setTickets([]);
            setAdmin('');
            setSelected(null);
            setStarted(null);
            setModal(null);
            notify('Создаётся новое анонимное пространство');
          }}>{t("Ключ сохранён, завершить")}</button></>}
 {modal === 'news' && <><span className="modal-icon"><Activity /></span><h2 id="modal-title">{t("Mgła 1.0 — начало пути")}</h2><p>{t("05 ноября 2026")}</p><div className="explain"><h3>{t("Пространство для двоих")}</h3><p>{t("Комнаты по случайному коду, зашифрованный WebRTC-диалог и передача файлов до 5 МБ.")}</p><h3>{t("Разработчики рядом")}</h3><p>{t("Анонимные обращения, ответы, статусы, повторное открытие и оценка поддержки.")}</p><h3>{t("Следующий шаг")}</h3><p>{t("Усиление сетевой анонимности и TURN-инфраструктура. Эти возможности пока не реализованы.")}</p></div><button className="button primary" onClick={() => setModal('ticket')}>{t("Поделиться идеей ")}<ArrowRight size={16} /></button></>}
 </section></div>}
 </div>;
}
function Empty({
  icon: Icon,
  title,
  text,
  action
}) {
  const {
    t
  } = useLanguage();
  return <div className="empty"><span className="empty-icon"><Icon size={32} /></span><h2>{t(title)}</h2><p>{t(text)}</p>{action}</div>;
}
createRoot(document.getElementById('root')).render(<LanguageProvider><App /></LanguageProvider>);
