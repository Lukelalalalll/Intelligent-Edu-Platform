with open("src/features/video-gen/styles/videoGen.module.css", "r") as f:
    text = f.read()

# Replace .langRow block
old_langRow = """.langRow {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
}
.langRow label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #475569;
}
.langRow select {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    font-size: 0.9rem;
    background: #fff;
    color: #334155;
}"""

new_langRow = """/* ── Config Grid ── */
.configGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 1.5rem;
    margin-bottom: 1.5rem;
}

@media (max-width: 768px) {
    .configGrid {
        grid-template-columns: 1fr;
    }
}

.langRow {
    display: flex;
    align-items: center;
    gap: 10px;
}
.langRow label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #475569;
}
.langRow select {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    font-size: 0.9rem;
    background: #fff;
    color: #334155;
    flex: 1;
}"""

text = text.replace(old_langRow, new_langRow)

# Add Step Title styles
step_title_styles = """
/* ── Step Title ── */
.stepTitle {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--text-main, #0f172a);
    margin-bottom: 24px;
}

.stepIcon {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    border-radius: 50%;
    background: rgba(0, 123, 85, 0.1);
    color: var(--primary-color, #007b55);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 700;
    transition: all 0.3s ease;
}

.stepCard:hover .stepIcon {
    background: var(--primary-color, #007b55);
    color: white;
    transform: scale(1.1);
    box-shadow: 0 4px 10px rgba(0, 123, 85, 0.3);
}

.stepCard h3 {
    display: none; /* Hide old h3 */
}
"""

text += step_title_styles

with open("src/features/video-gen/styles/videoGen.module.css", "w") as f:
    f.write(text)
