import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';

import QuestionGeneratorComposerStep from './QuestionGeneratorComposerStep';
import QuestionGeneratorHub from './QuestionGeneratorHub';
import QuestionGeneratorResultStep from './QuestionGeneratorResultStep';
import QuestionGeneratorStartStep from './QuestionGeneratorStartStep';

interface QuestionGeneratorWorkspaceProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorWorkspace({ controller }: QuestionGeneratorWorkspaceProps) {
    if (controller.state.view === 'hub') {
        return <QuestionGeneratorHub controller={controller} />;
    }

    if (controller.state.workspaceStep === 'start') {
        return <QuestionGeneratorStartStep controller={controller} />;
    }

    if (controller.state.workspaceStep === 'composer') {
        return <QuestionGeneratorComposerStep controller={controller} />;
    }

    return <QuestionGeneratorResultStep controller={controller} />;
}
