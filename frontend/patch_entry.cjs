const fs = require('fs');
let code = fs.readFileSync('src/entries/adminDashboardEntry.jsx', 'utf8');

// We just remove the window.confirm checks. We will do the confirmation inside AdminDashboard.jsx!
code = code.replace(/if \(\!window\.confirm\([\s\S]*?\) return;/g, '');

// Save it.
fs.writeFileSync('src/entries/adminDashboardEntry.jsx', code, 'utf8');
