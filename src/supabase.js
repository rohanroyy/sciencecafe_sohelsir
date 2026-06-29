import { createClient } from '@supabase/supabase-js';

// Helper to retrieve configuration from environment or localStorage
export const getSupabaseConfig = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey && envUrl !== 'YOUR_SUPABASE_URL') {
    return { url: envUrl, key: envKey, isEnv: true };
  }

  const localUrl = localStorage.getItem('supabase_url');
  const localKey = localStorage.getItem('supabase_anon_key');

  return {
    url: localUrl || '',
    key: localKey || '',
    isEnv: false
  };
};

// Save credentials to localStorage
export const saveSupabaseConfig = (url, key) => {
  localStorage.setItem('supabase_url', url.trim());
  localStorage.setItem('supabase_anon_key', key.trim());
};

// Reset credentials
export const clearSupabaseConfig = () => {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_anon_key');
  localStorage.removeItem('supabase_use_mock');
  localStorage.removeItem('mock_db_initialized');
  localStorage.removeItem('mock_session_user');
  // Clear mock tables
  const tables = ['teachers', 'students', 'batches', 'batch_students', 'exams', 'student_exams', 'notes', 'announcements', 'auth_users'];
  tables.forEach(t => localStorage.removeItem(`mock_db_${t}`));
  window.location.reload();
};

export const setMockModeActive = (active) => {
  if (active) {
    localStorage.setItem('supabase_use_mock', 'true');
    setupMockData();
  } else {
    localStorage.removeItem('supabase_use_mock');
  }
};

export const isMockModeActive = () => {
  return localStorage.getItem('supabase_use_mock') === 'true';
};

// Initial Mock Data setup for offline local mode
const setupMockData = () => {
  if (!localStorage.getItem('mock_db_initialized')) {
    localStorage.setItem('mock_db_initialized', 'true');
    
    // Create demo teacher
    const demoTeacherId = 'demo-teacher-id';
    localStorage.setItem('mock_db_teachers', JSON.stringify([{
      id: demoTeacherId,
      email: 'demoteacher@gmail.com',
      name: 'Professor Sohel Sir',
      dob: '1980-01-01',
      gender: 'Male',
      address: 'Science Cafe Campus, Dhaka',
      phone: '+8801711223344',
      institution: 'Science Cafe',
      degrees: 'M.Sc in Physics, PhD',
      experience: 15,
      subjects: ['Physics', 'Higher Math', 'Science'],
      is_profile_completed: true
    }]));

    // Register demo teacher in auth users
    localStorage.setItem('mock_auth_users', JSON.stringify([{
      id: demoTeacherId,
      email: 'demoteacher@gmail.com',
      password: 'teacher123'
    }]));

    // Create a demo batch
    const demoBatchId = 'demo-batch-1';
    localStorage.setItem('mock_db_batches', JSON.stringify([{
      id: demoBatchId,
      teacher_id: demoTeacherId,
      title: 'Physics SSC 2026 Batch',
      classes: ['SSC'],
      subjects: ['Physics'],
      thumbnail_url: '',
      created_at: new Date().toISOString()
    }]));

    // Create demo student
    const demoStudentId = 'demo-student-id';
    localStorage.setItem('mock_db_students', JSON.stringify([{
      id: demoStudentId,
      name: 'Abir Hossain',
      dob: '2008-05-15',
      gender: 'Male',
      institution: 'Dhaka Residential Model College',
      class: 'SSC',
      phone_number: '01712345678',
      email: 'student@gmail.com',
      is_approved: true,
      created_at: new Date().toISOString()
    }]));

    // Register demo student in auth users
    const users = JSON.parse(localStorage.getItem('mock_auth_users') || '[]');
    users.push({
      id: demoStudentId,
      email: 'student@gmail.com',
      password: 'student123'
    });
    localStorage.setItem('mock_auth_users', JSON.stringify(users));

    // Enroll student in batch
    localStorage.setItem('mock_db_batch_students', JSON.stringify([{
      batch_id: demoBatchId,
      student_id: demoStudentId
    }]));

    // Create demo announcement
    localStorage.setItem('mock_db_announcements', JSON.stringify([{
      id: 'demo-ann-1',
      batch_id: demoBatchId,
      title: 'Welcome to Physics SSC 2026',
      content: 'Welcome to Science Cafe! We will start our classes from next Sunday. Please make sure you download the Chapter 1 Lecture Notes.',
      created_at: new Date(Date.now() - 3600000).toISOString()
    }]));

    // Create demo note
    localStorage.setItem('mock_db_notes', JSON.stringify([{
      id: 'demo-note-1',
      batch_id: demoBatchId,
      title: 'Chapter 1: Physical Quantities & Measurements Notes',
      drive_link: 'https://drive.google.com/file/d/123456789/view',
      created_at: new Date(Date.now() - 7200000).toISOString()
    }]));
  }
};

// Simulated chainable Query Builder matching Supabase Client API
class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orderConfig = null;
    this.isSingle = false;
    this.isMaybeSingle = false;
    this.insertData = null;
    this.updateData = null;
    this.deleteActive = false;
    this.upsertData = null;
    this.upsertConflict = [];
  }

  select(fields = '*') {
    return this;
  }

  insert(data) {
    this.insertData = data;
    return this;
  }

  update(data) {
    this.updateData = data;
    return this;
  }

  delete() {
    this.deleteActive = true;
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  in(column, values) {
    this.filters.push({ type: 'in', column, values });
    return this;
  }

  gt(column, value) {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }

  upsert(data, options = {}) {
    this.upsertData = Array.isArray(data) ? data : [data];
    this.upsertConflict = (options.onConflict || '').split(',').map(c => c.trim()).filter(Boolean);
    return this;
  }

  order(column, options = {}) {
    this.orderConfig = { column, ascending: options.ascending !== false };
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    try {
      let data = JSON.parse(localStorage.getItem(`mock_db_${this.table}`) || '[]');

      // Handle upserts (insert-or-update on conflict columns)
      if (this.upsertData) {
        const result = [];
        this.upsertData.forEach(row => {
          if (this.upsertConflict.length > 0) {
            const idx = data.findIndex(e =>
              this.upsertConflict.every(col => e[col] === row[col])
            );
            if (idx >= 0) {
              data[idx] = { ...data[idx], ...row };
              result.push(data[idx]);
              return;
            }
          }
          const newRow = { id: Math.random().toString(36).substring(2, 11), created_at: new Date().toISOString(), ...row };
          data.push(newRow);
          result.push(newRow);
        });
        localStorage.setItem(`mock_db_${this.table}`, JSON.stringify(data));
        return { data: result.length === 1 ? result[0] : result, error: null };
      }
      
      // Handle inserts
      if (this.insertData) {
        const rowsToInsert = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
        const newRows = rowsToInsert.map(row => {
          return { 
            id: row.id || Math.random().toString(36).substring(2, 11), 
            created_at: new Date().toISOString(),
            ...row 
          };
        });
        data = [...newRows, ...data];
        localStorage.setItem(`mock_db_${this.table}`, JSON.stringify(data));
        
        // Dispatch custom event for mock mode notifications across tabs
        window.dispatchEvent(new CustomEvent('mock_db_insert', {
          detail: { table: this.table, rows: newRows }
        }));

        return { data: Array.isArray(this.insertData) ? newRows : newRows[0], error: null };
      }

      // Handle updates
      if (this.updateData) {
        data = data.map(row => {
          let match = true;
          for (const f of this.filters) {
            if (f.type === 'eq' && row[f.column] !== f.value) match = false;
            if (f.type === 'in' && !f.values.includes(row[f.column])) match = false;
          }
          if (match) {
            return { ...row, ...this.updateData };
          }
          return row;
        });
        localStorage.setItem(`mock_db_${this.table}`, JSON.stringify(data));
        
        const matched = data.filter(row => {
          let match = true;
          for (const f of this.filters) {
            if (f.type === 'eq' && row[f.column] !== f.value) match = false;
            if (f.type === 'in' && !f.values.includes(row[f.column])) match = false;
          }
          return match;
        });

        return { data: this.isSingle || this.isMaybeSingle ? matched[0] || null : matched, error: null };
      }

      // Handle deletes
      if (this.deleteActive) {
        data = data.filter(row => {
          let match = true;
          for (const f of this.filters) {
            if (f.type === 'eq' && row[f.column] !== f.value) match = false;
            if (f.type === 'in' && !f.values.includes(row[f.column])) match = false;
          }
          return !match;
        });
        localStorage.setItem(`mock_db_${this.table}`, JSON.stringify(data));
        return { data: null, error: null };
      }

      // Handle selects/filters
      let result = [...data];
      for (const f of this.filters) {
        if (f.type === 'eq') {
          result = result.filter(row => row[f.column] === f.value);
        } else if (f.type === 'in') {
          result = result.filter(row => f.values.includes(row[f.column]));
        } else if (f.type === 'gt') {
          result = result.filter(row => row[f.column] != null && row[f.column] > f.value);
        }
      }

      // Sorting
      if (this.orderConfig) {
        const { column, ascending } = this.orderConfig;
        result.sort((a, b) => {
          const valA = a[column];
          const valB = b[column];
          if (valA < valB) return ascending ? -1 : 1;
          if (valA > valB) return ascending ? 1 : -1;
          return 0;
        });
      }

      // Joins resolution to mock actual SQL results
      if (this.table === 'student_exams') {
        const students = JSON.parse(localStorage.getItem('mock_db_students') || '[]');
        result = result.map(se => ({
          ...se,
          students: students.find(s => s.id === se.student_id) || null
        }));
      }

      if (this.isSingle) {
        if (result.length === 0) {
          return { data: null, error: { code: 'PGRST116', message: 'Item not found' } };
        }
        return { data: result[0], error: null };
      }

      if (this.isMaybeSingle) {
        return { data: result[0] || null, error: null };
      }

      return { data: result, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }
}

class MockChannel {
  constructor(name) {
    this.name = name;
    this.listeners = [];
  }
  on(event, filter, callback) {
    if (event === 'postgres_changes') {
      const handleInsert = (e) => {
        const { table, rows } = e.detail;
        if (filter.table === table) {
          rows.forEach(row => {
            if (filter.filter) {
              const filterMatch = filter.filter.split('=eq.');
              if (filterMatch.length === 2) {
                const [col, val] = filterMatch;
                if (row[col] !== val) return;
              }
            }
            callback({ new: row });
          });
        }
      };
      this.listeners.push(handleInsert);
      window.addEventListener('mock_db_insert', handleInsert);
    }
    return this;
  }
  subscribe() {
    return this;
  }
  unsubscribe() {
    this.listeners.forEach(listener => {
      window.removeEventListener('mock_db_insert', listener);
    });
  }
}

// Simulated Supabase client instance
const createMockSupabaseClient = () => {
  return {
    auth: {
      async getSession() {
        const sessionUser = JSON.parse(localStorage.getItem('mock_session_user') || 'null');
        if (sessionUser) {
          return { data: { session: { user: sessionUser } }, error: null };
        }
        return { data: { session: null }, error: null };
      },

      onAuthStateChange(callback) {
        const handleStorageChange = () => {
          const sessionUser = JSON.parse(localStorage.getItem('mock_session_user') || 'null');
          callback('SIGNED_IN', sessionUser ? { user: sessionUser } : null);
        };
        window.addEventListener('mock_auth_change', handleStorageChange);
        
        const sessionUser = JSON.parse(localStorage.getItem('mock_session_user') || 'null');
        callback('INITIAL_SESSION', sessionUser ? { user: sessionUser } : null);

        return {
          data: {
            subscription: {
              unsubscribe: () => {
                window.removeEventListener('mock_auth_change', handleStorageChange);
              }
            }
          }
        };
      },

      async signUp({ email, password }) {
        const users = JSON.parse(localStorage.getItem('mock_auth_users') || '[]');
        if (users.find(u => u.email === email)) {
          return { data: { user: null }, error: { message: 'User already exists' } };
        }
        const newUser = { id: Math.random().toString(36).substring(2, 11), email };
        users.push({ ...newUser, password });
        localStorage.setItem('mock_auth_users', JSON.stringify(users));

        localStorage.setItem('mock_session_user', JSON.stringify(newUser));
        window.dispatchEvent(new Event('mock_auth_change'));

        return { data: { user: newUser, session: { user: newUser } }, error: null };
      },

      async signInWithPassword({ email, password }) {
        const users = JSON.parse(localStorage.getItem('mock_auth_users') || '[]');
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) {
          return { data: { user: null }, error: { message: 'Invalid login credentials' } };
        }
        
        const sessionUser = { id: user.id, email: user.email };
        localStorage.setItem('mock_session_user', JSON.stringify(sessionUser));
        window.dispatchEvent(new Event('mock_auth_change'));
        return { data: { user: sessionUser, session: { user: sessionUser } }, error: null };
      },

      async signOut() {
        localStorage.removeItem('mock_session_user');
        window.dispatchEvent(new Event('mock_auth_change'));
        return { error: null };
      }
    },

    from(table) {
      return new MockQueryBuilder(table);
    },

    channel(name) {
      return new MockChannel(name);
    },

    removeChannel(channel) {
      if (channel && typeof channel.unsubscribe === 'function') {
        channel.unsubscribe();
      }
    },
    removeAllChannels() {}
  };
};

const config = getSupabaseConfig();

export let supabase = null;

if (isMockModeActive()) {
  supabase = createMockSupabaseClient();
} else if (config.url && config.key) {
  supabase = createClient(config.url, config.key);
}
