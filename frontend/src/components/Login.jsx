import React, { useState } from 'react';
import { login, setToken } from '../api/index.js';
import { getMe } from '../api/index.js';
import { useStore } from '../store/index.js';
import '../styles/theme.css';

export default function Login({ navigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setToken: storeSetToken } = useStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      storeSetToken(data.access_token);
      const me = await getMe();
      setUser(me);
      navigate('dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)' }}>
      <div style={{ background: 'var(--bg-panel)', padding: '40px', borderRadius: '8px', border: '1px solid var(--border-color)', width: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px' }}>🦅</div>
          <h1 style={{ color: 'var(--color-primary)', fontSize: '24px', margin: '8px 0 4px' }}>Eagle Game Engine</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Sign in to your account</p>
        </div>

        {error && (
          <div style={{ background: '#e6394620', border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '8px 12px', marginBottom: '16px', color: 'var(--color-primary)', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{ width: '100%', background: '#0f3460', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '10px 12px', color: 'var(--color-accent)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', background: '#0f3460', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '10px 12px', color: 'var(--color-accent)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '12px', fontSize: '16px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
          No account?{' '}
          <span style={{ color: 'var(--color-secondary)', cursor: 'pointer' }} onClick={() => navigate('signup')}>
            Sign up
          </span>
        </p>
      </div>
    </div>
  );
}
