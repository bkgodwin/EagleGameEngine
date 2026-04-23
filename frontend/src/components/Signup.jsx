import React, { useState } from 'react';
import { signup, login, setToken, getMe } from '../api/index.js';
import { useStore } from '../store/index.js';
import '../styles/theme.css';

export default function Signup({ navigate }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setToken: storeSetToken } = useStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signup(email, username, password);
      // Auto login after signup
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

  const inputStyle = {
    width: '100%',
    background: '#0f3460',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    padding: '10px 12px',
    color: 'var(--color-accent)',
    fontSize: '14px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)' }}>
      <div style={{ background: 'var(--bg-panel)', padding: '40px', borderRadius: '8px', border: '1px solid var(--border-color)', width: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '48px' }}>🦅</div>
          <h1 style={{ color: 'var(--color-primary)', fontSize: '24px', margin: '8px 0 4px' }}>Eagle Game Engine</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Create your account</p>
        </div>

        {error && (
          <div style={{ background: '#e6394620', border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '8px 12px', marginBottom: '16px', color: 'var(--color-primary)', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>USERNAME</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required placeholder="cooldev123" style={inputStyle} minLength={3} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>CONFIRM PASSWORD</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="••••••••" style={inputStyle} />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '12px', fontSize: '16px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
          Already have an account?{' '}
          <span style={{ color: 'var(--color-secondary)', cursor: 'pointer' }} onClick={() => navigate('login')}>
            Sign in
          </span>
        </p>
      </div>
    </div>
  );
}
