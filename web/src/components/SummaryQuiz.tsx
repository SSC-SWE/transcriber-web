import { renderMarkdown } from '../markdown';
import type { Quiz, QuizQuestion } from '../types';
import { Icon } from '../icons';
import { Card, CardHead } from './ui';

export function SummaryView({ summary }: { summary: string }) {
  return (
    <Card>
      <CardHead title="AI Summary" subtitle="Generated from the transcript" />
      <div className="md">{renderMarkdown(summary)}</div>
    </Card>
  );
}

export function QuizView({ quiz }: { quiz: Quiz }) {
  return (
    <Card>
      <CardHead title={quiz.title} subtitle={quiz.description} />
      {quiz.formURL && (
        <div className="quiz-links">
          <a className="btn btn-sm" href={quiz.formURL} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={14} /> Open quiz form
          </a>
          {quiz.formEditURL && (
            <a className="btn btn-sm" href={quiz.formEditURL} target="_blank" rel="noopener noreferrer">
              <Icon name="edit" size={14} /> Edit form
            </a>
          )}
          <button
            className="btn btn-sm"
            onClick={() => void navigator.clipboard.writeText(quiz.formURL ?? '')}
            title="Copy student link"
          >
            <Icon name="link" size={14} /> Copy student link
          </button>
        </div>
      )}
      <div>
        {quiz.questions.map((question, i) => (
          <QuestionBlock key={i} question={question} />
        ))}
      </div>
    </Card>
  );
}

function QuestionBlock({ question }: { question: QuizQuestion }) {
  return (
    <div className="quiz-question">
      <p className="quiz-q">{question.question}</p>
      {question.options.map((option, i) => {
        const correct = i === question.answer;
        return (
          <div key={i} className={`quiz-option ${correct ? 'correct' : ''}`}>
            <span className="quiz-marker">
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                {correct ? (
                  <circle cx="5" cy="5" r="4.2" fill="currentColor" />
                ) : (
                  <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                )}
              </svg>
            </span>
            <span>{option}</span>
          </div>
        );
      })}
      {question.explanation && <p className="quiz-explanation">{question.explanation}</p>}
    </div>
  );
}
