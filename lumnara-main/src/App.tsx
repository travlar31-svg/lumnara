import React, { useState } from "react";

// ---------- Types ----------

interface Author {
  name: string;
  handle: string;
}

interface Comment {
  id: number;
  author: string;
  text: string;
  time: string;
}

interface Post {
  id: number;
  author: Author;
  text: string;
  tags: string[];
  liked: boolean;
  shared: boolean;
  shareAllowed: boolean;
  reactions: {
    likes: number;
    comments: number;
    shares: number;
  };
  comments: Comment[];
}

interface Message {
  id: number;
  from: string;
  encrypted: string;
  time: string;
}

interface User {
  id: number;
  name: string;
  handle: string;
}

interface FriendState extends User {
  isFriend: boolean;
  requestPending: boolean;
  isBlocked: boolean;
  isLive: boolean;
  liveStreamUrl?: string;
}

// ---------- Tiny XOR "encryption" demo (NOT real security) ----------

function generateSessionKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function xorEncrypt(plain: string, key: string): string {
  if (!key) return plain;
  const keyBytes = key.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [0];
  const out: number[] = [];
  for (let i = 0; i < plain.length; i += 1) {
    const c = plain.charCodeAt(i);
    const k = keyBytes[i % keyBytes.length];
    out.push(c ^ k);
  }
  return btoa(String.fromCharCode(...out));
}

function xorDecrypt(cipher: string, key: string): string {
  if (!key) return cipher;
  let bytes: number[] = [];
  try {
    const bin = atob(cipher);
    bytes = Array.from(bin).map((ch) => ch.charCodeAt(0));
  } catch {
    return cipher;
  }
  const keyBytes = key.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [0];
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const c = bytes[i];
    const k = keyBytes[i % keyBytes.length];
    out.push(c ^ k);
  }
  return String.fromCharCode(...out);
}

// ---------- Demo users for friends (no real backend) ----------

const baseUsers: User[] = [
  { id: 1, name: "Nova", handle: "@nova" },
  { id: 2, name: "Echo", handle: "@echo" },
  { id: 3, name: "Orion", handle: "@orion" },
];

// ---------- Helpers for live stream embeds ----------

function buildYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

function buildTwitchEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("twitch.tv")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const channel = parts[0];
    if (!channel) return null;
    // parent must match your deployed domain; for dev we use localhost
    const parent = "localhost";
    return `https://player.twitch.tv/?channel=${channel}&parent=${parent}`;
  } catch {
    return null;
  }
}

function buildLiveEmbed(url: string): { type: "youtube" | "twitch" | "link"; embedUrl?: string } {
  const yt = buildYouTubeEmbed(url);
  if (yt) return { type: "youtube", embedUrl: yt };
  const tw = buildTwitchEmbed(url);
  if (tw) return { type: "twitch", embedUrl: tw };
  return { type: "link" };
}

// ---------- App ----------

export function App() {
  // Auth gate (demo-only)
  const [isAuthed, setIsAuthed] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginAge, setLoginAge] = useState<string>("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Tabs: feed / messages / profile / friends
  const [activeTab, setActiveTab] = useState<"feed" | "messages" | "profile" | "friends">("feed");

  // Feed state
  const [posts, setPosts] = useState<Post[]>([]);
  const [composerText, setComposerText] = useState("");
  const [composerShareAllowed, setComposerShareAllowed] = useState(true);
  const [homeSearch, setHomeSearch] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});

  // Messaging state
  const [sessionKey] = useState<string>(() => generateSessionKey());
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState("");

  // Profile extras
  const [playlistDraft, setPlaylistDraft] = useState("");
  const [playlist, setPlaylist] = useState<string[]>([]);

  const [wallpaperDraft, setWallpaperDraft] = useState("");
  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [activeWallpaper, setActiveWallpaper] = useState<string | null>(null);

  const [liveStreamUrl, setLiveStreamUrl] = useState("");
  const [isLive, setIsLive] = useState(false);

  // Friends state
  const [friends, setFriends] = useState<FriendState[]>(
    baseUsers.map((u) => ({
      ...u,
      isFriend: false,
      requestPending: false,
      isBlocked: false,
      isLive: false,
      liveStreamUrl: undefined,
    }))
  );
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);

  const decryptedMessages = messages.map((m) => ({
    ...m,
    text: xorDecrypt(m.encrypted, sessionKey),
  }));

  const visiblePosts = posts.filter((post) => {
    const q = homeSearch.trim().toLowerCase();
    if (!q) return true;
    const text = post.text.toLowerCase();
    const tags = post.tags.join(" ").toLowerCase();
    const author = `${post.author.name} ${post.author.handle}`.toLowerCase();
    return text.includes(q) || tags.includes(q) || author.includes(q);
  });

  const sessionKeySnippet = sessionKey.slice(0, 8);

  // ---------- Auth handlers (demo-only) ----------

  function handleEnter() {
    const emailOk = loginEmail.includes("@") && loginEmail.includes(".");
    const ageNum = Number(loginAge);
    if (!emailOk) {
      setAuthError("Enter a valid email address.");
      return;
    }
    if (!loginPassword || loginPassword.length < 6) {
      setAuthError("Password should be at least 6 characters (demo only).");
      return;
    }
    if (!Number.isFinite(ageNum) || ageNum < 16) {
      setAuthError("You must be at least 16 to use this demo.");
      return;
    }
    if (!ageConfirmed) {
      setAuthError("Please confirm you are at least 16.");
      return;
    }
    setAuthError(null);
    setIsAuthed(true);
  }

  // ---------- Feed handlers ----------

  function handlePublish() {
    const raw = composerText.trim();
    if (!raw) return;
    const tagMatches = raw.match(/#[\w-]+/g) ?? [];
    const tags = Array.from(new Set(tagMatches.map((t) => t.replace("#", ""))));
    const newPost: Post = {
      id: Date.now(),
      author: { name: "You", handle: "@you" },
      text: raw,
      tags,
      liked: false,
      shared: false,
      shareAllowed: composerShareAllowed,
      reactions: { likes: 0, comments: 0, shares: 0 },
      comments: [],
    };
    setPosts((prev) => [newPost, ...prev]);
    setComposerText("");
    setComposerShareAllowed(true);
  }

  function toggleLike(id: number) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const liked = !p.liked;
        const likes = p.reactions.likes + (liked ? 1 : -1);
        return {
          ...p,
          liked,
          reactions: { ...p.reactions, likes: Math.max(0, likes) },
        };
      })
    );
  }

  function toggleShare(id: number) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (!p.shareAllowed) return p;
        const shared = !p.shared;
        const shares = p.reactions.shares + (shared ? 1 : -1);
        return {
          ...p,
          shared,
          reactions: { ...p.reactions, shares: Math.max(0, shares) },
        };
      })
    );
  }

  function toggleCommentsOpen(id: number) {
    setOpenComments((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function changeCommentDraft(id: number, text: string) {
    setCommentDrafts((prev) => ({ ...prev, [id]: text }));
  }

  function addComment(id: number) {
    const draft = commentDrafts[id]?.trim();
    if (!draft) return;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newComment: Comment = {
          id: Date.now(),
          author: "you",
          text: draft,
          time: "now",
        };
        return {
          ...p,
          comments: [...p.comments, newComment],
          reactions: {
            ...p.reactions,
            comments: p.reactions.comments + 1,
          },
        };
      })
    );
    setCommentDrafts((prev) => ({ ...prev, [id]: "" }));
  }

  // ---------- Messaging ----------

  function sendMessage() {
    const txt = messageDraft.trim();
    if (!txt) return;
    const encrypted = xorEncrypt(txt, sessionKey);
    const msg: Message = {
      id: Date.now(),
      from: "you",
      encrypted,
      time: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [msg, ...prev]);
    setMessageDraft("");
  }

  // ---------- Playlist ----------

  function addTrack() {
    const url = playlistDraft.trim();
    if (!url) return;
    setPlaylist((prev) => [url, ...prev]);
    setPlaylistDraft("");
  }

  function removeTrack(url: string) {
    setPlaylist((prev) => prev.filter((u) => u !== url));
  }

  // ---------- Wallpapers ----------

  function addWallpaper() {
    const url = wallpaperDraft.trim();
    if (!url) return;
    setWallpapers((prev) => [url, ...prev]);
    setWallpaperDraft("");
  }

  function removeWallpaper(url: string) {
    setWallpapers((prev) => prev.filter((u) => u !== url));
    if (activeWallpaper === url) setActiveWallpaper(null);
  }

  // ---------- Live streaming (profile) ----------

  function saveLiveStatus() {
    const trimmed = liveStreamUrl.trim();
    if (!trimmed) {
      setIsLive(false);
      return;
    }
    setLiveStreamUrl(trimmed);
  }

  // ---------- Friends ----------

  function addFriend(id: number) {
    setFriends((prev) =>
      prev.map((f) => (f.id === id ? { ...f, requestPending: true } : f))
    );
  }

  function acceptFriend(id: number) {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, isFriend: true, requestPending: false }
          : f
      )
    );
  }

  function cancelRequest(id: number) {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, requestPending: false } : f
      )
    );
  }

  function removeFriend(id: number) {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, isFriend: false, requestPending: false } : f
      )
    );
  }

  function blockUser(id: number) {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, isBlocked: true, isFriend: false, requestPending: false }
          : f
      )
    );
  }

  function unblockUser(id: number) {
    setFriends((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isBlocked: false } : f))
    );
  }

  function viewFriendFeed(id: number) {
    setSelectedFriendId(id);
  }

  const selectedFriend =
    selectedFriendId != null
      ? friends.find((f) => f.id === selectedFriendId) ?? null
      : null;

  // ---------- Render helpers ----------

  function renderLiveEmbed(url: string) {
    const info = buildLiveEmbed(url);
    if (info.type === "youtube" && info.embedUrl) {
      return (
        <iframe
          title="YouTube live"
          src={info.embedUrl}
          className="h-48 w-full rounded-2xl border border-slate-700/80"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    if (info.type === "twitch" && info.embedUrl) {
      return (
        <iframe
          title="Twitch live"
          src={info.embedUrl}
          className="h-48 w-full rounded-2xl border border-slate-700/80"
          allowFullScreen
        />
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-cyan-300 underline"
      >
        Open live stream
      </a>
    );
  }

  // ---------- Auth gate UI ----------

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl bg-slate-900/90 p-6 ring-1 ring-slate-700/70 shadow-xl">
          <h1 className="mb-2 text-center text-lg font-semibold tracking-[0.26em] text-slate-50">
            LUMANARA
          </h1>
          <p className="mb-4 text-center text-xs text-slate-300/80">
            Sign in with email, password and confirm you are at least 16. This
            is a local-only demo; nothing is stored on a server.
          </p>
          <div className="space-y-2 text-xs">
            <div>
              <label className="mb-1 block text-slate-300">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-300">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="At least 6 characters (demo only)"
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-300">Age</label>
              <input
                type="number"
                value={loginAge}
                onChange={(e) => setLoginAge(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="16+ only"
                min={0}
              />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
              />
              I confirm I am at least 16 years old and understand this is a
              local-only demo.
            </label>
            {authError && (
              <p className="text-[11px] text-rose-400">{authError}</p>
            )}
            <button
              type="button"
              onClick={handleEnter}
              className="mt-2 w-full rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_26px_rgba(59,130,246,0.8)]"
            >
              Enter LUMANARA
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Main app UI ----------

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Global wallpaper if set */}
      {activeWallpaper && (
        <div
          className="pointer-events-none fixed inset-0 -z-20 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${activeWallpaper})` }}
        />
      )}

      {/* Diamond background glows */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[-6rem] h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-[40%] bg-gradient-to-tr from-cyan-500/10 via-transparent to-indigo-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-4 rounded-3xl bg-slate-900/80 p-4 shadow-[0_0_40px_rgba(15,23,42,0.9)] ring-1 ring-slate-700/70 backdrop-blur-2xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[conic-gradient(at_30%_20%,#22d3ee,#a855f7,#ec4899,#22c55e,#22d3ee)] shadow-[0_0_40px_rgba(56,189,248,0.8)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950/90 ring-1 ring-white/20">
                <span className="text-xs font-semibold tracking-[0.25em] text-cyan-200">
                  LU
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-[0.26em] text-slate-50">
                  LUMANARA
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-300/80">
                Social feed, messages, profiles, playlists and live stream embeds in a Linux-flavored, diamond-glass UI.
              </p>
            </div>
          </div>

          {/* Tabs */}
          <nav className="mt-2 flex items-center gap-2 rounded-full bg-slate-900/80 px-1 py-1 ring-1 ring-slate-700/60 lg:mt-0">
            {[
              { id: "feed" as const, label: "Feed" },
              { id: "messages" as const, label: "Messages" },
              { id: "profile" as const, label: "Profile" },
              { id: "friends" as const, label: "Friends" },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    "relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all " +
                    (active
                      ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 text-slate-950 shadow-[0_0_30px_rgba(59,130,246,0.8)]"
                      : "text-slate-300 hover:bg-slate-800/80")
                  }
                >
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (tab.id === "feed"
                        ? "bg-emerald-300"
                        : tab.id === "messages"
                        ? "bg-cyan-300"
                        : tab.id === "profile"
                        ? "bg-fuchsia-300"
                        : "bg-indigo-300")
                    }
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </header>

        {/* Main layout */}
        <main className="flex flex-1 flex-col gap-6 lg:flex-row">
          {/* Left column: tab content */}
          <section className="flex-1 space-y-4">
            {activeTab === "messages" && (
              <div className="space-y-4">
                {/* Messages composer */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                      <h2 className="text-sm font-semibold text-slate-100">Messages</h2>
                    </div>
                    <div className="text-[11px] text-cyan-300/90">
                      key: <span className="font-mono">{sessionKeySnippet}…</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={messageDraft}
                      onChange={(e) => setMessageDraft(e.target.value)}
                      placeholder="Send an encrypted message…"
                      className="flex-1 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={!messageDraft.trim()}
                      className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_26px_rgba(59,130,246,0.8)] transition-transform disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.7),transparent)] bg-[length:200%_100%] opacity-70 [animation:shimmer_3s_infinite]" />
                      <span className="relative">Send</span>
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Messages are stored as ciphertext in this browser only and
                    decrypted here with your session key.
                  </p>
                </div>

                {/* Messages list */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
                  <h3 className="mb-2 text-xs font-semibold text-slate-200">
                    Thread
                  </h3>
                  {decryptedMessages.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No messages yet. Start a small test conversation.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {decryptedMessages.map((m) => (
                        <li
                          key={m.id}
                          className="rounded-2xl bg-slate-950/70 px-3 py-2 ring-1 ring-slate-700/80"
                        >
                          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-mono text-emerald-300">{m.from}</span>
                            <span>{m.time}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-slate-100">
                            {m.text}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === "feed" && (
              <>
                {/* Composer */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono text-cyan-300">python@lumanara:~$</span>
                    <span>meta: local-only • linux-inspired</span>
                  </div>
                  <textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    rows={3}
                    placeholder="Write a post with keywords, meta tags (#linux, #python, #privacy)…"
                    className="w-full resize-none rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={composerShareAllowed}
                        onChange={(e) => setComposerShareAllowed(e.target.checked)}
                        className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
                      />
                      Allow others to share this post
                    </label>
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={!composerText.trim()}
                      className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_26px_rgba(59,130,246,0.8)] transition-transform disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.7),transparent)] bg-[length:200%_100%] opacity-70 [animation:shimmer_3s_infinite]" />
                      <span className="relative">Post to feed</span>
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Meta search: posts are matched by text, tags, and author. Use
                    tags like <span className="text-cyan-300">#linux</span>,{' '}
                    <span className="text-cyan-300">#python</span>, or{' '}
                    <span className="text-cyan-300">#privacy</span>.
                  </p>
                </div>

                {/* Feed header + search */}
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Feed
                  </h2>
                  <input
                    type="text"
                    value={homeSearch}
                    onChange={(e) => setHomeSearch(e.target.value)}
                    placeholder="Search posts by meta keywords…"
                    className="w-48 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                </div>

                {/* Feed list */}
                <div className="space-y-3">
                  {visiblePosts.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No posts yet. Write something above using your favorite
                      Linux or Python meta keywords.
                    </p>
                  ) : (
                    visiblePosts.map((post) => (
                      <article
                        key={post.id}
                        className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70"
                      >
                        <header className="mb-2 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold text-slate-100">
                                {post.author.name}
                              </span>
                              <span className="text-slate-400">
                                {post.author.handle}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              kernel meta-time: now
                            </div>
                          </div>
                        </header>
                        <p className="mb-2 whitespace-pre-wrap text-xs text-slate-100">
                          {post.text}
                        </p>
                        {post.tags.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {post.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-cyan-300 ring-1 ring-cyan-500/40"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <footer className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          <button
                            type="button"
                            onClick={() => toggleLike(post.id)}
                            className="flex items-center gap-1 hover:text-cyan-300"
                          >
                            <span
                              className={
                                "h-1.5 w-1.5 rounded-full " +
                                (post.liked
                                  ? "bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
                                  : "bg-slate-500")
                              }
                            />
                            <span>
                              {post.reactions.likes} like
                              {post.reactions.likes === 1 ? "" : "s"}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleCommentsOpen(post.id)}
                            className="flex items-center gap-1 hover:text-emerald-300"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                            <span>
                              {post.reactions.comments} replies (
                              {openComments[post.id] ? "hide" : "view"})
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleShare(post.id)}
                            disabled={!post.shareAllowed}
                            className={
                              "flex items-center gap-1 " +
                              (post.shareAllowed
                                ? "hover:text-fuchsia-300"
                                : "cursor-not-allowed text-slate-500")
                            }
                            title={
                              post.shareAllowed
                                ? post.shared
                                  ? "Unshare this post"
                                  : "Share this post"
                                : "Sharing disabled by the author"
                            }
                          >
                            <span
                              className={
                                "h-1.5 w-1.5 rounded-full " +
                                (post.shared
                                  ? "bg-fuchsia-300 shadow-[0_0_8px_rgba(244,114,182,0.9)]"
                                  : "bg-slate-500")
                              }
                            />
                            <span>
                              {post.reactions.shares}{" "}
                              {post.shareAllowed
                                ? post.shared
                                  ? "shared"
                                  : "shares"
                                : "shares locked"}
                            </span>
                          </button>
                        </footer>

                        {openComments[post.id] && (
                          <div className="mt-3 space-y-2 rounded-2xl bg-slate-950/70 p-3 ring-1 ring-slate-700/70">
                            {post.comments.length === 0 ? (
                              <p className="text-[11px] text-slate-400">
                                No replies yet. Be the first.
                              </p>
                            ) : (
                              <ul className="space-y-1 text-[11px]">
                                {post.comments.map((c) => (
                                  <li key={c.id} className="text-slate-200">
                                    <span className="font-mono text-cyan-300">
                                      {c.author}
                                    </span>
                                    : {c.text}{" "}
                                    <span className="text-slate-500">({c.time})</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                value={commentDrafts[post.id] ?? ""}
                                onChange={(e) =>
                                  changeCommentDraft(post.id, e.target.value)
                                }
                                placeholder="Reply with a comment…"
                                className="flex-1 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              />
                              <button
                                type="button"
                                onClick={() => addComment(post.id)}
                                disabled={!(commentDrafts[post.id] ?? "").trim()}
                                className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 shadow-[0_0_18px_rgba(59,130,246,0.8)] transition-transform disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <span className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.7),transparent)] bg-[length:200%_100%] opacity-70 [animation:shimmer_3s_infinite]" />
                                <span className="relative">Reply</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </>
            )}

            {activeTab === "profile" && (
              <div className="space-y-4">
                {/* Profile card */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70 shadow-[0_0_40px_rgba(15,23,42,0.9)]">
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Profile
                  </h2>
                  <p className="text-sm font-semibold text-slate-100">
                    You <span className="text-slate-400">@you</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    linux • python • meta • live streams • playlists • wallpapers
                  </p>
                </div>

                {/* Playlist */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Music playlist
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      paste Spotify / YouTube links
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={playlistDraft}
                      onChange={(e) => setPlaylistDraft(e.target.value)}
                      placeholder="Paste a track or playlist URL…"
                      className="flex-1 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={addTrack}
                      disabled={!playlistDraft.trim()}
                      className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_26px_rgba(59,130,246,0.8)] transition-transform disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.7),transparent)] bg-[length:200%_100%] opacity-70 [animation:shimmer_3s_infinite]" />
                      <span className="relative">Add track</span>
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {playlist.length === 0 ? (
                      <p className="text-slate-400">
                        No tracks yet. Paste a link above to start your playlist.
                      </p>
                    ) : (
                      playlist.map((url) => (
                        <div
                          key={url}
                          className="flex items-center justify-between gap-2 rounded-2xl bg-slate-950/80 px-3 py-2 ring-1 ring-slate-700/80"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-cyan-300 underline"
                          >
                            {url}
                          </a>
                          <button
                            type="button"
                            onClick={() => removeTrack(url)}
                            className="text-[10px] text-slate-400 hover:text-rose-300"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Wallpapers */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Live wallpapers & backgrounds
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      paste image / video URLs
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={wallpaperDraft}
                      onChange={(e) => setWallpaperDraft(e.target.value)}
                      placeholder="Paste an image or video URL…"
                      className="flex-1 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={addWallpaper}
                      disabled={!wallpaperDraft.trim()}
                      className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_26px_rgba(59,130,246,0.8)] transition-transform disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.7),transparent)] bg-[length:200%_100%] opacity-70 [animation:shimmer_3s_infinite]" />
                      <span className="relative">Add wallpaper</span>
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    {wallpapers.length === 0 ? (
                      <p className="col-span-1 text-slate-400">
                        No wallpapers yet. Paste a URL above to start your
                        collection.
                      </p>
                    ) : (
                      wallpapers.map((url) => (
                        <div
                          key={url}
                          className="space-y-1 rounded-2xl bg-slate-950/80 p-2 ring-1 ring-slate-700/80"
                        >
                          <div className="h-20 w-full overflow-hidden rounded-xl bg-slate-900">
                            {/* Simple preview */}
                            <img
                              src={url}
                              alt="wallpaper preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveWallpaper(url)}
                              className="text-[10px] text-cyan-300 hover:text-cyan-200"
                            >
                              {activeWallpaper === url
                                ? "Active background"
                                : "Set as background"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeWallpaper(url)}
                              className="text-[10px] text-slate-400 hover:text-rose-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Live streaming */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Live streaming
                    </h3>
                    {isLive && liveStreamUrl && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 ring-1 ring-rose-500/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-xs">
                    <input
                      type="text"
                      value={liveStreamUrl}
                      onChange={(e) => setLiveStreamUrl(e.target.value)}
                      placeholder="Paste your Twitch or YouTube Live URL…"
                      className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                    />
                    <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={isLive}
                        onChange={(e) => setIsLive(e.target.checked)}
                        className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-rose-400 focus:ring-rose-400"
                      />
                      I am currently live on this URL
                    </label>
                    <button
                      type="button"
                      onClick={saveLiveStatus}
                      className="relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-rose-400 via-orange-400 to-yellow-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_26px_rgba(248,113,113,0.8)]"
                    >
                      <span className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.7),transparent)] bg-[length:200%_100%] opacity-70 [animation:shimmer_3s_infinite]" />
                      <span className="relative">Save live status</span>
                    </button>
                    <p className="text-[11px] text-slate-400">
                      This does not host your stream. LUMANARA only embeds your
                      Twitch / YouTube Live (or links out) and shows a LIVE
                      badge.
                    </p>
                    {isLive && liveStreamUrl && (
                      <div className="mt-2">
                        {renderLiveEmbed(liveStreamUrl)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "friends" && (
              <div className="grid gap-4 md:grid-cols-2">
                {/* Friends list */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Friends
                  </h2>
                  <div className="space-y-2 text-xs">
                    {friends.map((f) => {
                      const status = f.isBlocked
                        ? "Blocked"
                        : f.isFriend
                        ? "Friend"
                        : f.requestPending
                        ? "Request pending"
                        : "Not a friend yet";
                      return (
                        <div
                          key={f.id}
                          className="space-y-1 rounded-2xl bg-slate-950/80 p-2 ring-1 ring-slate-700/80"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-100">
                                  {f.name}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {f.handle}
                                </span>
                                {f.isLive && f.liveStreamUrl && !f.isBlocked && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 ring-1 ring-rose-500/60">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
                                    LIVE
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {status}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => viewFriendFeed(f.id)}
                              className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-100 hover:bg-slate-700"
                            >
                              View feed
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {!f.isBlocked && !f.isFriend && !f.requestPending && (
                              <button
                                type="button"
                                onClick={() => addFriend(f.id)}
                                className="rounded-full bg-emerald-600 px-2 py-0.5 text-emerald-50 hover:bg-emerald-500"
                              >
                                Add friend
                              </button>
                            )}
                            {!f.isBlocked && f.requestPending && !f.isFriend && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => acceptFriend(f.id)}
                                  className="rounded-full bg-cyan-600 px-2 py-0.5 text-cyan-50 hover:bg-cyan-500"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancelRequest(f.id)}
                                  className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-100 hover:bg-slate-600"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {!f.isBlocked && f.isFriend && (
                              <button
                                type="button"
                                onClick={() => removeFriend(f.id)}
                                className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-100 hover:bg-slate-600"
                              >
                                Remove
                              </button>
                            )}
                            {!f.isBlocked && (
                              <button
                                type="button"
                                onClick={() => blockUser(f.id)}
                                className="rounded-full bg-rose-700 px-2 py-0.5 text-rose-50 hover:bg-rose-600"
                              >
                                Block
                              </button>
                            )}
                            {f.isBlocked && (
                              <button
                                type="button"
                                onClick={() => unblockUser(f.id)}
                                className="rounded-full bg-emerald-700 px-2 py-0.5 text-emerald-50 hover:bg-emerald-600"
                              >
                                Unblock
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Friend feed */}
                <div className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Friend feed
                  </h2>
                  {!selectedFriend && (
                    <p className="text-xs text-slate-400">
                      Select “View feed” on a friend. You must be friends and
                      not blocked to see their demo posts or live stream.
                    </p>
                  )}
                  {selectedFriend && (
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">
                            {selectedFriend.name}{" "}
                            <span className="text-slate-400">
                              {selectedFriend.handle}
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {selectedFriend.isBlocked
                              ? "You have blocked this user. Unblock to view their feed."
                              : !selectedFriend.isFriend
                              ? "Add this user as a friend to view their feed."
                              : "Local-only demo posts and optional live embed."}
                          </p>
                        </div>
                        {selectedFriend.isLive &&
                          selectedFriend.liveStreamUrl &&
                          !selectedFriend.isBlocked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 ring-1 ring-rose-500/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
                              LIVE
                            </span>
                          )}
                      </div>

                      {selectedFriend.isFriend &&
                        !selectedFriend.isBlocked &&
                        selectedFriend.isLive &&
                        selectedFriend.liveStreamUrl && (
                          <div>{renderLiveEmbed(selectedFriend.liveStreamUrl)}</div>
                        )}

                      {selectedFriend.isFriend && !selectedFriend.isBlocked && (
                        <p className="text-[11px] text-slate-400">
                          Friend posts would appear here in a real backend.
                          This demo keeps posts local to your own feed.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Right column: sidebar */}
          <aside className="mt-4 w-full space-y-4 lg:mt-0 lg:w-72">
            <section className="rounded-3xl bg-gradient-to-br from-emerald-500/20 via-slate-900/90 to-sky-500/20 p-4 ring-1 ring-emerald-400/60 shadow-[0_0_50px_rgba(16,185,129,0.8)]">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                System
              </h2>
              <p className="mb-2 text-[11px] text-emerald-100/90">
                LUMANARA OS • web • linux-inspired shell.
              </p>
              <ul className="space-y-1 text-[11px] text-emerald-100/90">
                <li>kernel: 6.x • glass-ui</li>
                <li>python: 3.x • meta search helpers</li>
                <li>shell: feed, messages, profiles, friends</li>
                <li>privacy: local-only session, no backend</li>
              </ul>
            </section>

            <section className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Online
                </h2>
                <span className="text-[11px] text-slate-400">local session</span>
              </div>
              <p className="text-[11px] text-slate-400">
                This demo does not connect to a real server. All users, posts,
                messages, playlists, wallpapers, and live links exist only in
                your browser memory and are cleared on refresh.
              </p>
            </section>

            <section className="rounded-3xl bg-slate-900/80 p-4 ring-1 ring-slate-700/70">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Getting started
              </h2>
              <ul className="space-y-1 text-[11px] text-slate-400">
                <li>- Post with Linux or Python keywords & #tags.</li>
                <li>- Like, comment, and share posts you enjoy.</li>
                <li>- Use Messages to test encrypted chat.</li>
                <li>- On Profile, add music and wallpapers.</li>
                <li>- Paste your live stream URL to embed Twitch/YouTube.</li>
                <li>- Use Friends to simulate requests, blocks, and feeds.</li>
              </ul>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}
