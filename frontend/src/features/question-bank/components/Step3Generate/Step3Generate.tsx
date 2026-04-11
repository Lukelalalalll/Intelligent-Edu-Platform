import React from 'react';
import styles from '../../styles/questionBank.module.css';
import GenerationSourceSelector from './components/GenerationSourceSelector';
import GenerationConfigForm from './components/GenerationConfigForm';
import GeneratedQuestionsPanel from './components/GeneratedQuestionsPanel';
import QuestionOpsPanel from './components/QuestionOpsPanel';
import type { Step3GenerateProps } from './types';

export default function Step3Generate({ states, handlers }: Step3GenerateProps) {
    const {
        exercises,
        rawExtractText,
        questionType,
        numQuestions,
        difficulty,
        constraints,
        constraintSuggestions,
        isSuggestingConstraints,
        savedScreenshots,
        outputLanguage,
        generateLoading,
        generatedQuestions,
        provider,
        generationSource,
        generationMode,
        fileName,
        selectedPages,
        questionOpsSummary,
        questionOpsItems,
        questionOpsLoading,
        questionOpsError,
        questionOpsThreshold,
        questionOpsSort,
        questionOpsDuplicatesOnly,
        questionOpsTagFilter,
        questionOpsDedupeResult,
        questionOpsDedupeLoading,
    } = states;

    const {
        setQuestionType,
        setNumQuestions,
        setDifficulty,
        setConstraints,
        setOutputLanguage,
        setGenerationSource,
        setProvider,
        onSuggestConstraints,
        setQuestionOpsThreshold,
        setQuestionOpsSort,
        setQuestionOpsDuplicatesOnly,
        setQuestionOpsTagFilter,
        goToStep2,
        generateQuestions,
        exportQuestions,
        runQuestionOps,
        applyQuestionOpsDedupe,
    } = handlers;

    const screenshotSourceUnavailable =
        generationSource === 'screenshot_set' &&
        (savedScreenshots.length === 0 || (!exercises.length && !rawExtractText));

    return (
        <div className={styles.stepContainer}>
            <div className={styles.stepTitle}>
                <div className={styles.stepNumber}>3</div>
                Generate New Questions
            </div>

            <GenerationSourceSelector
                generationSource={generationSource}
                generationMode={generationMode}
                fileName={fileName}
                selectedPages={selectedPages}
                savedScreenshots={savedScreenshots}
                setGenerationSource={setGenerationSource}
            />

            <GenerationConfigForm
                questionType={questionType}
                numQuestions={numQuestions}
                difficulty={difficulty}
                constraints={constraints}
                constraintSuggestions={constraintSuggestions}
                isSuggestingConstraints={isSuggestingConstraints}
                outputLanguage={outputLanguage}
                provider={provider}
                setQuestionType={setQuestionType}
                setNumQuestions={setNumQuestions}
                setDifficulty={setDifficulty}
                setConstraints={setConstraints}
                setOutputLanguage={setOutputLanguage}
                setProvider={setProvider}
                onSuggestConstraints={onSuggestConstraints}
            />

            {generationSource === 'screenshot_set' && (
                <div className={styles.formGroup}>
                    <div className={styles.infoBox}>
                        <p style={{ margin: 0 }}>Will use your curated visual reference set from Step 2 as generation context.</p>
                        <div style={{ color: 'var(--primary-color)', fontWeight: 'bold', marginTop: '8px' }}>
                            {savedScreenshots.length} image{savedScreenshots.length !== 1 ? 's' : ''} ready for generation.
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={goToStep2}>
                    <i className="fas fa-arrow-left"></i> Back: Extract Content
                </button>

                <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={generateQuestions}
                    disabled={generateLoading || screenshotSourceUnavailable}
                >
                    {generateLoading
                        ? <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                        : <><i className="fas fa-robot"></i> Generate Questions</>}
                </button>
            </div>

            <GeneratedQuestionsPanel
                generatedQuestions={generatedQuestions}
                generateLoading={generateLoading}
                exportQuestions={exportQuestions}
            />

            <QuestionOpsPanel
                generatedQuestions={generatedQuestions}
                rawExtractText={rawExtractText}
                questionOpsSummary={questionOpsSummary}
                questionOpsItems={questionOpsItems}
                questionOpsLoading={questionOpsLoading}
                questionOpsError={questionOpsError}
                questionOpsThreshold={questionOpsThreshold}
                questionOpsSort={questionOpsSort}
                questionOpsDuplicatesOnly={questionOpsDuplicatesOnly}
                questionOpsTagFilter={questionOpsTagFilter}
                questionOpsDedupeResult={questionOpsDedupeResult}
                questionOpsDedupeLoading={questionOpsDedupeLoading}
                setQuestionOpsThreshold={setQuestionOpsThreshold}
                setQuestionOpsSort={setQuestionOpsSort}
                setQuestionOpsDuplicatesOnly={setQuestionOpsDuplicatesOnly}
                setQuestionOpsTagFilter={setQuestionOpsTagFilter}
                runQuestionOps={runQuestionOps}
                applyQuestionOpsDedupe={applyQuestionOpsDedupe}
            />
        </div>
    );
}