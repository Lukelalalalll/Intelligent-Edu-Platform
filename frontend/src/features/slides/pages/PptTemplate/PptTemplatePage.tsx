import { useNavigate } from 'react-router-dom';
import PptTemplateView from './PptTemplateView';
import SlidesLoadingState from '../../components/SlidesLoadingState';
import { useSlideTemplateEditor } from './hooks/useSlideTemplateEditor';

export default function PptTemplatePage() {
    const navigate = useNavigate();
    const { states, handlers } = useSlideTemplateEditor();
    const { isLoadingSchema, pptSchema, errorMsg } = states;

    if (isLoadingSchema) {
        return (
            <div className="container" style={{ paddingTop: '2rem' }}>
                <SlidesLoadingState title="Loading template editor" subtitle="Preparing themes, layouts, and your slide schema." compact />
            </div>
        );
    }

    if (!pptSchema) {
        return (
            <div className="container" style={{ paddingTop: '2rem' }}>
                <div className="alert alert-warning">
                    <strong>PPT schema is missing.</strong>
                    <div style={{ marginTop: '0.5rem' }}>{errorMsg || 'Please generate slides in previous steps before entering this page.'}</div>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/slides/specify')}>
                    Back to Specify
                </button>
            </div>
        );
    }

    return <PptTemplateView states={states} handlers={handlers} />;
}
