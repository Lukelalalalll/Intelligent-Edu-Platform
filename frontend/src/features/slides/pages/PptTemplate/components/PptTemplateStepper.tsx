import styles from '../styles/pptTemplate.module.css';

type StepItem = {
    step: number;
    title: string;
    icon: string;
};

type Props = {
    items: StepItem[];
    currentStep: number;
    onStepClick: (step: number) => void;
};

export default function PptTemplateStepper({ items, currentStep, onStepClick }: Props) {
    return (
        <div className={styles.stepperWrap}>
            {items.map((item) => {
                const active = currentStep === item.step;
                const done = currentStep > item.step;

                return (
                    <div
                        key={item.step}
                        className={`${styles.stepperItem} ${active ? styles.stepperItemActive : ''} ${done ? styles.stepperItemDone : ''}`}
                        onClick={() => onStepClick(item.step)}
                    >
                        <div className={styles.stepperCircle}>
                            {done ? <i className="fas fa-check" /> : <i className={`fas ${item.icon}`} />}
                        </div>
                        <div className={styles.stepperLabel}>{item.title}</div>
                    </div>
                );
            })}
        </div>
    );
}
