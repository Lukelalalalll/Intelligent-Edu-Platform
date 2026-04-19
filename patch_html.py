import re

with open('DB_SCHEMA.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace mermaid config
new_config = """<script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'base',
            themeVariables: {
                fontFamily: 'Inter, system-ui, sans-serif',
                lineColor: '#cbd5e1',
                textColor: '#1e293b',
                background: 'transparent'
            },
            flowchart: {
                curve: 'basis',
                htmlLabels: true
            }
        });
    </script>"""
content = re.sub(r'<script>\s*mermaid\.initialize\(\{.*?\}\);\s*</script>', new_config, content, flags=re.DOTALL)

# Replace flowchart-container
new_flowchart = """<h2 class="section-title">Entity Relationships Visualized <span class="badge">Architecture Flow</span></h2>
    <div class="flowchart-container" style="background:#ffffff; border:1px solid #e0e7ff; box-shadow:0 10px 25px rgba(67, 56, 202, 0.05); padding: 50px;">
        <div class="mermaid">
        flowchart LR
            classDef root fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a,rx:12px,ry:12px
            classDef academic fill:#f0fdf4,stroke:#10b981,stroke-width:2px,color:#064e3b,rx:12px,ry:12px
            classDef chat fill:#fdf4ff,stroke:#d946ef,stroke-width:2px,color:#701a75,rx:12px,ry:12px

            linkStyle default stroke:#94a3b8,stroke-width:3px,color:#1e293b,font-size:13.5px,font-family:Inter,font-weight:600

            U["`**👤 USERS (Core)**
            ---
            • _id (PK)
            • role
            • email
            • preferences`"]:::root

            CS["`**📚 COURSE_SECTIONS**
            ---
            • _id (PK)
            • ownerTeacherId (FK)
            • courseCode`"]:::academic

            EN["`**🎓 ENROLLMENTS**
            ---
            • _id (PK)
            • courseSectionId (FK)
            • userId (FK)`"]:::academic

            CR["`**💬 CHAT_ROOMS**
            ---
            • _id (PK)
            • courseId (FK)
            • type`"]:::chat

            CM["`**📨 CHAT_MESSAGES**
            ---
            • _id (PK)
            • roomId (FK)
            • senderId (FK)`"]:::chat

            AI["`**🤖 AI_SESSIONS**
            ---
            • _id (PK)
            • userId (FK)
            • messages`"]:::chat

            U ==>|"🧑‍🏫 Owns"| CS
            U -.->|"🎓 Enrolls"| EN
            CS ==>|"📦 Contains"| EN
            
            U ==>|"💬 Members of"| CR
            CR ==>|"📨 Contains"| CM
            CS -.->|"🔗 Course Chat"| CR
            U -.->|"🤖 Conducts"| AI
        </div>
    </div>"""

content = re.sub(r'<h2 class="section-title">Entity Relationship Diagram.*?</div>\s*</div>', new_flowchart, content, flags=re.DOTALL)

with open('DB_SCHEMA.html', 'w', encoding='utf-8') as f:
    f.write(content)

