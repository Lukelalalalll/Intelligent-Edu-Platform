const fs = require('fs');
let css = fs.readFileSync('src/styles/AdminDashboard.module.css', 'utf8');

css = css.replace(/\.adminWorkspace \{[\s\S]*?opacity: 0;\n\}/m, `.adminWorkspace {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: stretch;
    animation: tabPopIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards 0.15s;
    opacity: 0;
}`);

css = css.replace(/\.modeSidebar \{[\s\S]*?gap: 10px;\n\}/m, `.modeSidebar {
    background: rgba(255, 255, 255, 0.9);
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    padding: 10px;
    display: flex;
    flex-direction: row;
    gap: 10px;
    justify-content: center;
    width: fit-content;
    margin: 0 auto;
}`);
fs.writeFileSync('src/styles/AdminDashboard.module.css', css, 'utf8');
