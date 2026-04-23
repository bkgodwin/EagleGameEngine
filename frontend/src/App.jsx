import React, { useState, useEffect } from 'react';
import { getMe, getToken } from './api/index.js';
import { useStore } from './store/index.js';
import Login from './components/Login.jsx';
import Signup from './components/Signup.jsx';
import Dashboard from './components/Dashboard.jsx';
import Editor from './components/Editor.jsx';

export default function App() {
  const [page, setPage] = useState('login');
  const { setUser } = useStore();

  useEffect(() => {
    const token = getToken();
    if (token) {
      getMe()
        .then((me) => {
          setUser(me);
          setPage('dashboard');
        })
        .catch(() => {
          setPage('login');
        });
    }
  }, []);

  const navigate = (target) => setPage(target);

  if (page === 'login') return <Login navigate={navigate} />;
  if (page === 'signup') return <Signup navigate={navigate} />;
  if (page === 'dashboard') return <Dashboard navigate={navigate} />;
  if (page === 'editor') return <Editor navigate={navigate} />;
  return <Login navigate={navigate} />;
}
