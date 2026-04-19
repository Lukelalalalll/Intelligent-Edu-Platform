import re

css_file = 'src/features/rag-evaluator/styles/RagEvaluator.module.css'
with open(css_file, 'r') as f:
    content = f.read()

# Replace Stepper section
stepper_old = r"""/\* ── Stepper ────────────────────────────────── \*/.*?\.stepBtnCompleted \{.*?\n\}"""

stepper_new = """/* ── Stepper ────────────────────────────────── */
.stepperWrap {
    composes: stepperWrap from '../../../../shared/styles/stepper.module.css';
    max-width: 900px;
    --stepper-accent: #6b21a8;
    --stepper-accent-light: rgba(107, 33, 168, 0.15);
    --stepper-accent-shadow: rgba(107, 33, 168, 0.2);
}
.stepperItem { composes: stepperItem from '../../../../shared/styles/stepper.module.css'; }
.stepperCircle { composes: stepperCircle from '../../../../shared/styles/stepper.module.css'; }
.stepperLabel { composes: stepperLabel from '../../../../shared/styles/stepper.module.css'; }
.stepperItemDone { composes: stepperItemDone from '../../../../shared/styles/stepper.module.css'; }
.stepperItemActive { composes: stepperItemActive from '../../../../shared/styles/stepper.module.css'; }

@keyframes tabPopIn {
    0% { opacity: 0; transform: translateY(20px) scale(0.95); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
}

.stepContainer {
    background-color: var(--bg-card, #ffffff);
    backdrop-filter: blur(12px);
    border-radius: var(--radius-lg, 16px);
    border: 1px solid rgba(0, 0, 0, 0.05);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
    padding: 2.5rem;
    margin-bottom: 2.5rem;
    position: relative;
    opacity: 0;
    overflow: hidden;
    transition: all 0.3s ease;
    animation: tabPopIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards 0.5s;
}

.ragBanner {
    margin-bottom: 1rem;
    background-image: linear-gradient(135deg, #6b21a8, #2b6cb0) !important;
}
"""

content = re.sub(stepper_old, stepper_new, content, flags=re.DOTALL)

with open(css_file, 'w') as f:
    f.write(content)
