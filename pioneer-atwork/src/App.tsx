import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Briefcase, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Compass, 
  LayoutDashboard, 
  ListTodo, 
  Plus, 
  Settings, 
  User,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface Task {
  id: string;
  title: string;
  category: string;
  status: 'pending' | 'completed';
  time: string;
}

const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('atwork-tasks');
    return saved ? JSON.parse(saved) : [
      { id: '1', title: 'Design System Update', category: 'Design', status: 'pending', time: '10:00 AM' },
      { id: '2', title: 'Client Meeting', category: 'Management', status: 'completed', time: '11:30 AM' },
      { id: '3', title: 'Component Review', category: 'Dev', status: 'pending', time: '02:00 PM' }
    ];
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [userName] = useState('Pioneer Explorer');

  useEffect(() => {
    localStorage.setItem('atwork-tasks', JSON.stringify(tasks));
  }, [tasks]);

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t));
  };

  const addTask = () => {
    const title = prompt('What are you working on?');
    if (title) {
      const newTask: Task = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        category: 'Project',
        status: 'pending',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setTasks([newTask, ...tasks]);
    }
  };

  const NavItem = ({ id, icon: Icon, label }: { id: string, icon: any, label: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`sidebar-item ${activeTab === id ? 'active' : ''}`}
    >
      <Icon size={20} />
      <span>{label}</span>
      {activeTab === id && <motion.div layoutId="bubble" className="active-indicator" />}
    </button>
  );

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar glass">
        <div className="brand">
          <div className="logo-box">
            <Compass className="logo-icon" />
          </div>
          <h1>Pioneer</h1>
        </div>

        <nav className="nav-list">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="tasks" icon={ListTodo} label="At Work" />
          <NavItem id="schedule" icon={Calendar} label="Schedule" />
          <NavItem id="profile" icon={User} label="Profile" />
        </nav>

        <div className="sidebar-footer">
          <button className="btn-icon"><Settings size={20} /></button>
          <div className="user-avatar">
            <div className="avatar">P</div>
            <div className="user-info">
              <span className="user-name">{userName}</span>
              <span className="user-status">Online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="content">
        <header className="main-header animate-fade-in">
          <div className="header-greeting">
            <h2 className="title-gradient">Good Morning, {userName.split(' ')[0]}</h2>
            <p className="text-muted">You have {tasks.filter(t => t.status === 'pending').length} tasks remaining today.</p>
          </div>
          <div className="header-actions">
            <button className="btn-icon"><Bell size={20} /></button>
            <button onClick={addTask} className="btn-primary">
              <Plus size={20} />
              <span>New Task</span>
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="dashboard-view"
            >
              <div className="stats-grid">
                <div className="stats-card glass">
                  <div className="icon-wrap indigo"><Zap size={24} /></div>
                  <div className="stats-info">
                    <h3>Focus Score</h3>
                    <p>84% <span className="trend">+5%</span></p>
                  </div>
                </div>
                <div className="stats-card glass">
                  <div className="icon-wrap pink"><Clock size={24} /></div>
                  <div className="stats-info">
                    <h3>Hours Active</h3>
                    <p>6.5h <span className="trend">Today</span></p>
                  </div>
                </div>
                <div className="stats-card glass">
                  <div className="icon-wrap green"><Briefcase size={24} /></div>
                  <div className="stats-info">
                    <h3>AtWork Mode</h3>
                    <p>Active <span className="trend pulse">●</span></p>
                  </div>
                </div>
              </div>

              <div className="active-section card">
                <div className="section-head">
                  <h3>Recent Focus</h3>
                  <button className="text-btn">View All</button>
                </div>
                <div className="task-list-mini">
                  {tasks.slice(0, 3).map(task => (
                    <div key={task.id} className="mini-task-item">
                      <div className={`status-dot ${task.status}`}></div>
                      <span className="task-title">{task.title}</span>
                      <span className="task-time">{task.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'tasks' && (
            <motion.div 
              key="tasks"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="tasks-view"
            >
              <div className="tasks-container card">
                <div className="section-head">
                  <h2>Tasks At Work</h2>
                  <span className="badge">{tasks.length} Total</span>
                </div>
                <div className="full-task-list">
                  {tasks.map(task => (
                    <div 
                      key={task.id} 
                      className={`task-row ${task.status}`}
                      onClick={() => toggleTask(task.id)}
                    >
                      <div className="checkbox">
                        {task.status === 'completed' && <CheckCircle2 size={20} />}
                      </div>
                      <div className="task-main">
                        <h4>{task.title}</h4>
                        <span className="task-meta">{task.category} • {task.time}</span>
                      </div>
                      <div className="task-action-btn">
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                           <Clock size={18} className="text-muted" />
                        </motion.div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        .sidebar {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 40px;
          border-right: 1px solid var(--border);
          border-radius: 0 32px 32px 0;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-box {
          width: 40px;
          height: 40px;
          background: var(--primary);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 8px 16px -4px rgba(99, 102, 241, 0.4);
        }
        .logo-icon {
          width: 24px;
          height: 24px;
        }
        .nav-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-grow: 1;
        }
        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 14px;
          color: var(--text-muted);
          font-weight: 500;
          position: relative;
          background: transparent;
        }
        .sidebar-item:hover {
          color: var(--text);
          background: rgba(0,0,0,0.02);
        }
        .sidebar-item.active {
          color: var(--primary);
        }
        .active-indicator {
          position: absolute;
          left: 0;
          width: 4px;
          height: 20px;
          background: var(--primary);
          border-radius: 0 4px 4px 0;
        }
        .sidebar-footer {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .user-avatar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #fff;
          border-radius: 16px;
          border: 1px solid var(--border);
        }
        .avatar {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #6366f1, #ec4899);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
        }
        .user-info {
          display: flex;
          flex-direction: column;
        }
        .user-name {
          font-size: 14px;
          font-weight: 600;
        }
        .user-status {
          font-size: 12px;
          color: var(--accent);
          font-weight: 500;
        }
        .main-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 24px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin-bottom: 24px;
        }
        .stats-card {
          display: flex;
          align-items: center;
          gap: 16px;
          border-radius: 24px;
          padding: 24px;
        }
        .icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .indigo { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
        .pink { background: rgba(236, 72, 153, 0.1); color: #ec4899; }
        .green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .stats-info h3 {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .stats-info p {
          font-size: 20px;
          font-weight: 700;
        }
        .trend {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          margin-left: 4px;
        }
        .pulse {
          color: var(--accent);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .text-btn {
          background: transparent;
          color: var(--primary);
          font-size: 14px;
        }
        .task-list-mini {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mini-task-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(0,0,0,0.02);
          border-radius: 12px;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .status-dot.pending { background: #fbbf24; }
        .status-dot.completed { background: #10b981; }
        .task-title {
          flex-grow: 1;
          font-size: 14px;
          font-weight: 500;
        }
        .task-time {
          font-size: 12px;
          color: var(--text-muted);
        }
        .task-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-radius: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .task-row:hover {
          background: rgba(0,0,0,0.02);
        }
        .task-row.completed h4 {
          text-decoration: line-through;
          color: var(--text-muted);
        }
        .checkbox {
          width: 24px;
          height: 24px;
          border: 2px solid var(--border);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }
        .task-row.completed .checkbox {
          border-color: var(--accent);
          background: rgba(16, 185, 129, 0.1);
        }
        .task-main {
          flex-grow: 1;
        }
        .task-meta {
          font-size: 12px;
          color: var(--text-muted);
        }
        .badge {
          background: var(--primary);
          color: white;
          padding: 2px 8px;
          border-radius: 99px;
          font-size: 10px;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
};

export default App;
