'use client';

import { useState } from 'react';

export function LoginForm() {
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const reply = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PM-Request': '1' },
        body: JSON.stringify({ password }),
      });
      if (reply.ok) {
        window.location.href = '/';
        return;
      }
      setProblem((await reply.json().catch(() => null))?.message ?? '로그인하지 못했습니다.');
    } catch {
      setProblem('서버에 연결할 수 없습니다.');
    }
    setBusy(false);
  }

  return (
    <main className="page login">
      <h1 className="brand">PROJECTS 2036</h1>
      <form className="panel" onSubmit={submit}>
        <label className="field">
          <span>비밀번호</span>
          <input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {problem && <p className="notice" role="alert">{problem}</p>}
        <button className="primary" disabled={busy || !password}>{busy ? '확인 중…' : '들어가기'}</button>
      </form>
    </main>
  );
}
