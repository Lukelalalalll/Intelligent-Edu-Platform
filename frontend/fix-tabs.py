import re

with open('src/styles/Chat.module.css', 'r') as f:
    text = f.read()

pattern = re.compile(r'\.leftTabBar \{.*?\.leftTabBtnActive \{.*?\}', re.DOTALL)
replacement = """\.leftTabBar {
  display: flex;
  border-top: 1px solid rgba(0,0,0,0.06);
  background: rgba(250, 250, 250, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-shrink: 0;
}

.leftTabBtn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 0;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.leftTabBtn i {
  font-size: 1.18rem;
}

.leftTabBtn:hover {
  color: #007B55;
  background: rgba(0,123,85,0.04);
}

.leftTabBtnActive {
  color: #007B55;
  border-top: 2px solid #007B55;
  margin-top: -1px;
  background: rgba(0,123,85,0.06);
}"""

new_text = pattern.sub(replacement, text)
with open('src/styles/Chat.module.css', 'w') as f:
    f.write(new_text)

