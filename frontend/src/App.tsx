import './App.css';

type DashboardSection = {
  title: string;
  items: string[];
};

const sections: DashboardSection[] = [
  {
    title: 'User Management',
    items: [
      'View and edit user profiles',
      'Edit golf scores',
      'Manage subscriptions',
    ],
  },
  {
    title: 'Draw Management',
    items: [
      'Configure draw logic (random vs. algorithm)',
      'Run simulations',
      'Publish results',
    ],
  },
  {
    title: 'Charity Management',
    items: [
      'Add, edit, delete charities',
      'Manage content and media',
    ],
  },
  {
    title: 'Winners Management',
    items: [
      'View full winners list',
      'Verify submissions',
      'Mark payouts as completed',
    ],
  },
  {
    title: 'Reports and Analytics',
    items: [
      'Total users',
      'Total prize pool',
      'Charity contribution totals',
      'Draw statistics',
    ],
  },
];

function App() {
  return (
    <main className="dashboard-page">
      <section className="dashboard-shell">
        <header className="dashboard-header">
          <span className="dashboard-badge">11</span>
          <h1>Admin Dashboard</h1>
        </header>

        <div className="dashboard-content">
          {sections.map((section) => (
            <section key={section.title} className="dashboard-section">
              <h2>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
