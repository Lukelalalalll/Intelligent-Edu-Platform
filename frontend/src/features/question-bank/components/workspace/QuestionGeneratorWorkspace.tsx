import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';

import QuestionGeneratorComposerStep from './QuestionGeneratorComposerStep';
import QuestionGeneratorResultStep from './QuestionGeneratorResultStep';

interface QuestionGeneratorWorkspaceProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorWorkspace({ controller }: QuestionGeneratorWorkspaceProps) {
    if (controller.state.workspaceStep === 'result') {
        return <QuestionGeneratorResultStep controller={controller} />;
    }
    return <QuestionGeneratorComposerStep controller={controller} />;
}
