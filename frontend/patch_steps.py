import glob
import re

files = glob.glob("src/features/video-gen/components/Step*.tsx")

for file in files:
    with open(file, "r") as f:
        text = f.read()
    
    # <h3>Step 1: Input Content</h3>
    # pattern: <h3>Step (\d+): (.*?)</h3>
    text = re.sub(r'<h3>Step (\d+):\s*(.*?)</h3>',
                  r'<div className={s.stepTitle}>\n        <div className={s.stepIcon}>\n          \1\n        </div>\n        \2\n      </div>',
                  text)
    
    # <h3><i className="fas fa-palette" style={{ marginRight: '8px', color: '#007b55' }} />Scene Editor</h3>
    # pattern for specific fas icons or without Step N
    text = re.sub(r'<h3><i className="fas (.*?)"(.*?)/>(.*?)</h3>',
                  r'<div className={s.stepTitle}>\n        <div className={s.stepIcon}><i className="fas \1"/></div>\n        \3\n      </div>',
                  text)
    
    with open(file, "w") as f:
        f.write(text)
