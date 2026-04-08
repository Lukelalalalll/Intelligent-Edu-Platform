import re

with open('src/styles/Chat.module.css', 'r') as f:
    text = f.read()

pattern = re.compile(r'\.messageInputBar \{.*?\.sendBtn:disabled \{.*?\}', re.DOTALL)
replacement = """.messageInputBar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(0,0,0,0.06);
  background: rgba(250, 250, 250, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.messageInput {
  flex: 1;
  padding: 12px 18px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 24px;
  font-size: 1.06rem;
  outline: none;
  background: rgba(255, 255, 255, 0.8);
  color: #1e293b;
  transition: all 0.2s ease;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.02);
}

.messageInput:focus {
  background: #fff;
  border-color: #007B55;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.02), 0 0 0 3px rgba(0,123,85,0.1);
}

.sendBtn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #007B55, #005F41);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.12rem;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 10px rgba(0, 123, 85, 0.2);
  flex-shrink: 0;
}

.sendBtn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0, 123, 85, 0.3);
}

.sendBtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}"""

new_text = pattern.sub(replacement, text)
with open('src/styles/Chat.module.css', 'w') as f:
    f.write(new_text)

