const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');
content = content.replace(/<img (?![^>]*loading=)/g, '<img loading="lazy" ');
fs.writeFileSync('src/App.jsx', content);
