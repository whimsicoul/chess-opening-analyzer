import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import './auth.css';
import './Settings.css';

function EyeIcon({ open }) {
  if (open) return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function PasswordInput({ name, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrapper">
      <input
        name={name}
        type={show ? 'text' : 'password'}
        placeholder={placeholder || '••••••••'}
        value={value}
        onChange={onChange}
        required
      />
      <button type="button" className="password-toggle" onClick={() => setShow(v => !v)} tabIndex={-1}>
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

function ChangeUsernameForm({ onUsernameChanged }) {
  const [form, setForm] = useState({ new_username: '', current_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.patch('/auth/username', {
        current_password: form.current_password,
        new_username: form.new_username,
      });
      onUsernameChanged(res.data.username);
      setSuccess('Username updated successfully.');
      setForm({ new_username: '', current_password: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-label">Change Username</div>
      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>New Username</label>
          <input
            name="new_username"
            type="text"
            placeholder="3–20 alphanumeric or underscore"
            value={form.new_username}
            onChange={handleChange}
            required
          />
        </div>
        <div className="auth-field">
          <label>Current Password</label>
          <PasswordInput
            name="current_password"
            value={form.current_password}
            onChange={handleChange}
          />
        </div>
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Update Username'}
        </button>
      </form>
    </div>
  );
}

function ChangeEmailForm({ onEmailChanged }) {
  const [form, setForm] = useState({ new_email: '', current_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.patch('/auth/email', {
        current_password: form.current_password,
        new_email: form.new_email,
      });
      onEmailChanged(form.new_email.toLowerCase());
      setSuccess('Email updated successfully.');
      setForm({ new_email: '', current_password: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-label">Change Email</div>
      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>New Email</label>
          <input
            name="new_email"
            type="email"
            placeholder="you@example.com"
            value={form.new_email}
            onChange={handleChange}
            required
          />
        </div>
        <div className="auth-field">
          <label>Current Password</label>
          <PasswordInput
            name="current_password"
            value={form.current_password}
            onChange={handleChange}
          />
        </div>
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Update Email'}
        </button>
      </form>
    </div>
  );
}

function ChangePasswordForm() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.new_password !== form.confirm_password) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.patch('/auth/password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setSuccess('Password updated successfully.');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-label">Change Password</div>
      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label>Current Password</label>
          <PasswordInput
            name="current_password"
            value={form.current_password}
            onChange={handleChange}
          />
        </div>
        <div className="auth-field">
          <label>New Password</label>
          <PasswordInput
            name="new_password"
            value={form.new_password}
            onChange={handleChange}
            placeholder="Min. 8 characters"
          />
        </div>
        <div className="auth-field">
          <label>Confirm New Password</label>
          <PasswordInput
            name="confirm_password"
            value={form.confirm_password}
            onChange={handleChange}
            placeholder="Re-enter new password"
          />
        </div>
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

export default function Settings() {
  const { updateUser, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  useEffect(() => {
    api.get('/auth/me')
      .then(res => setProfile(res.data))
      .catch(() => setProfileError('Could not load profile.'));
  }, []);

  function handleUsernameChanged(newUsername) {
    updateUser({ username: newUsername });
    setProfile(p => p ? { ...p, username: newUsername } : p);
  }

  function handleEmailChanged(newEmail) {
    setProfile(p => p ? { ...p, email: newEmail } : p);
  }

  function resetModal() {
    setShowDeleteModal(false);
    setDeleteStep(1);
    setDeletePassword('');
    setDeleteError('');
    setDeleteLoading(false);
    setShowDeletePassword(false);
  }

  async function handleDeleteConfirm() {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await api.delete('/auth/account', { data: { password: deletePassword } });
      logout();
      navigate('/');
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Something went wrong.');
      setDeleteLoading(false);
    }
  }

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <div className="page settings-page">
      <div className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your account information and security preferences</p>
      </div>

      {/* Account Info */}
      <div className="card">
        <div className="card-label">Account Info</div>
        {profileError && <div className="auth-error">{profileError}</div>}
        {profile ? (
          <>
            <div className="settings-info-row">
              <span className="settings-info-label">Username</span>
              <span className="settings-info-value">{profile.username}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Email</span>
              <span className="settings-info-value">{profile.email}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Member Since</span>
              <span className="settings-info-value">{memberSince}</span>
            </div>
          </>
        ) : !profileError ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Loading…</p>
        ) : null}
      </div>

      <div className="settings-section-label">Security</div>

      <ChangeUsernameForm onUsernameChanged={handleUsernameChanged} />
      <ChangeEmailForm onEmailChanged={handleEmailChanged} />
      <ChangePasswordForm />

      <div className="settings-section-label">Danger Zone</div>

      <div className="card settings-danger-zone">
        <div className="card-label">Delete Account</div>
        <p className="settings-danger-desc">
          Permanently delete your account and all associated data — games, repertoire lines, and statistics.
          This action cannot be undone.
        </p>
        <button className="auth-submit" style={{ background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)' }} onClick={() => setShowDeleteModal(true)}>
          Delete Account
        </button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div
          className="settings-modal-overlay"
          onClick={deleteStep === 1 ? resetModal : undefined}
        >
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            {deleteStep === 1 ? (
              <>
                <h2>Delete Your Account</h2>
                <p>
                  This will permanently delete your account and all your data.
                  Enter your password to continue.
                </p>
                {deleteError && <div className="auth-error">{deleteError}</div>}
                <div className="auth-field">
                  <label>Password</label>
                  <div className="password-wrapper">
                    <input
                      type={showDeletePassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={deletePassword}
                      onChange={e => { setDeletePassword(e.target.value); setDeleteError(''); }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowDeletePassword(v => !v)}
                      tabIndex={-1}
                    >
                      <EyeIcon open={showDeletePassword} />
                    </button>
                  </div>
                </div>
                <div className="settings-modal-footer">
                  <button className="auth-submit" style={{ width: 'auto', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)' }} type="button" onClick={resetModal}>
                    Cancel
                  </button>
                  <button
                    className="auth-submit"
                    style={{ width: 'auto' }}
                    type="button"
                    disabled={!deletePassword}
                    onClick={() => setDeleteStep(2)}
                  >
                    Continue →
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Are you absolutely sure?</h2>
                <div className="settings-modal-warning">
                  This will permanently delete your account and all associated data including:
                  games, opening repertoires, and statistics. There is no way to recover this data.
                </div>
                {deleteError && <div className="auth-error">{deleteError}</div>}
                <div className="settings-modal-footer">
                  <button
                    className="auth-submit"
                    style={{ width: 'auto', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
                    type="button"
                    onClick={() => { setDeleteStep(1); setDeleteError(''); }}
                  >
                    ← Back
                  </button>
                  <button
                    className="btn-delete-confirm"
                    type="button"
                    disabled={deleteLoading}
                    onClick={handleDeleteConfirm}
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete My Account'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
