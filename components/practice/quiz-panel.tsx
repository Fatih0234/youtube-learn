"use client";

import { useState, useMemo } from "react";
import { Topic, QuizQuestion, QuizAnswer } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Lightbulb, Sparkles, CheckCircle2, XCircle, HelpCircle, ArrowRight, RotateCcw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizPanelProps {
  topics: Topic[];
  videoTitle?: string;
}

const difficultyOptions = [
  { value: "easy", label: "Easy", icon: "😊" },
  { value: "medium", label: "Medium", icon: "😐" },
  { value: "hard", label: "Hard", icon: "🔥" },
];

type QuizState = 'settings' | 'quiz' | 'finished';

export function QuizPanel({ topics, videoTitle }: QuizPanelProps) {
  const [quizState, setQuizState] = useState<QuizState>('settings');
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [showHints, setShowHints] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Calculate 80% MC, 20% T/F
  const mcCount = Math.floor(numQuestions * 0.8);
  const tfCount = numQuestions - mcCount;

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex) / numQuestions) * 100;

  const generateQuestions = async () => {
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics: topics.map(t => ({
            title: t.title,
            description: t.description,
            segments: t.segments?.slice(0, 3).map(s => ({
              start: s.start,
              end: s.end,
              text: s.text,
            })),
          })),
          numberOfQuestions: numQuestions,
          difficulty,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate quiz');
      }

      const data = await response.json();
      const generatedQuestions: QuizQuestion[] = data.questions.map((q: any, idx: number) => ({
        id: `q-${idx}`,
        type: q.type,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        timestamp: q.timestamp,
      }));

      // Shuffle questions
      const shuffled = generatedQuestions.sort(() => Math.random() - 0.5);
      
      setQuestions(shuffled);
      setCurrentQuestionIndex(0);
      setAnswers([]);
      setSelectedAnswer(null);
      setShowFeedback(false);
      setQuizState('quiz');
    } catch (error) {
      console.error('Failed to generate quiz:', error);
      // Fallback to dummy questions if API fails
      generateDummyQuestions();
    } finally {
      setIsGenerating(false);
    }
  };

  const generateDummyQuestions = () => {
    const generatedQuestions: QuizQuestion[] = [];
    
    // Multiple choice questions (80%)
    for (let i = 0; i < mcCount; i++) {
      const topic = topics[i % topics.length] || { title: "the video content" };
      generatedQuestions.push({
        id: `mc-${i}`,
        type: 'multiple-choice',
        question: `Based on what you heard about "${topic.title}", which of the following is correct?`,
        options: [
          `It discusses advanced ${topic.title?.split(' ')[0] || 'topics'}`,
          `It explains fundamental concepts of ${topic.title?.split(' ').slice(0, 2).join(' ') || 'learning'}`,
          `It covers practical applications and techniques`,
          `It focuses on theoretical frameworks only`,
        ],
        correctAnswer: `It covers practical applications and techniques`,
        explanation: `The video demonstrates practical applications and real-world techniques for ${topic.title}.`,
        timestamp: topic.segments?.[0]?.start,
      });
    }

    // True/False questions (20%)
    for (let i = 0; i < tfCount; i++) {
      const topic = topics[i % topics.length] || { title: "this topic" };
      const isTrue = Math.random() > 0.5;
      generatedQuestions.push({
        id: `tf-${i}`,
        type: 'true-false',
        question: `True or False: The video explains how to implement ${topic.title} in practice.`,
        correctAnswer: isTrue ? "True" : "False",
        explanation: isTrue 
          ? `Yes, the video demonstrates practical implementation of ${topic.title}.`
          : `No, the video focuses on theoretical concepts rather than implementation.`,
        timestamp: topic.segments?.[0]?.start,
      });
    }

    // Shuffle questions
    const shuffled = generatedQuestions.sort(() => Math.random() - 0.5);
    
    setQuestions(shuffled);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setQuizState('quiz');
  };

  const handleAnswer = () => {
    if (!selectedAnswer || !currentQuestion) return;

    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    setAnswers([...answers, {
      questionId: currentQuestion.id,
      selectedAnswer,
      isCorrect,
    }]);
    setShowFeedback(true);
  };

  const handleNext = () => {
    if (currentQuestionIndex < numQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
    } else {
      setQuizState('finished');
    }
  };

  const handleRestart = () => {
    setQuizState('settings');
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowFeedback(false);
  };

  const correctCount = answers.filter(a => a.isCorrect).length;

  // Render settings state
  if (quizState === 'settings') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Quiz Settings</h2>
          <p className="text-sm text-muted-foreground">Customize your listening comprehension quiz.</p>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="text-sm font-medium">Number of Questions</Label>
            <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {numQuestions}
            </span>
          </div>
          <Slider
            value={[numQuestions]}
            onValueChange={([value]) => setNumQuestions(value)}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
            <span>1</span>
            <span>{numQuestions}</span>
            <span>10</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {mcCount} multiple choice, {tfCount} true/false
          </p>
        </div>

        <div>
          <Label className="block text-sm font-medium mb-3">Difficulty Level</Label>
          <RadioGroup
            value={difficulty}
            onValueChange={(value) => setDifficulty(value as "easy" | "medium" | "hard")}
            className="grid grid-cols-3 gap-3"
          >
            {difficultyOptions.map((option) => (
              <label key={option.value} className="cursor-pointer">
                <RadioGroupItem value={option.value} className="peer sr-only" />
                <div className="p-3 rounded-xl border border-border bg-background text-center hover:border-primary peer-checked:border-primary peer-checked:bg-primary/5 transition-all">
                  <span className="text-2xl mb-1 block">{option.icon}</span>
                  <span className="text-xs font-medium">{option.label}</span>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-background rounded-lg shadow-sm">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Transcript Hints</span>
              <span className="text-xs text-muted-foreground">Show relevant segment during quiz</span>
            </div>
          </div>
          <Switch checked={showHints} onCheckedChange={setShowHints} />
        </div>

        <Button
          onClick={generateQuestions}
          disabled={isGenerating || topics.length === 0}
          className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
        >
          {isGenerating ? (
            <>
              <Sparkles className="mr-2 h-4 w-4 animate-spin" />
              Generating Quiz...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Quiz
            </>
          )}
        </Button>

        {topics.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Generate topics first to create a quiz.
          </p>
        )}

        <p className="text-xs text-muted-foreground text-center pt-2">
          AI-generated questions based on {videoTitle || "video content"}.
        </p>
      </div>
    );
  }

  // Render quiz state
  if (quizState === 'quiz' && currentQuestion) {
    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Question {currentQuestionIndex + 1} of {numQuestions}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Question Type Badge */}
        <div className="flex items-center gap-2">
          <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            currentQuestion.type === 'multiple-choice' 
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
          )}>
            {currentQuestion.type === 'multiple-choice' ? 'Multiple Choice' : 'True / False'}
          </span>
          {showHints && currentQuestion.timestamp && (
            <Button variant="link" size="sm" className="text-xs h-auto p-0 text-primary">
              <Lightbulb className="h-3 w-3 mr-1" />
              Watch segment
            </Button>
          )}
        </div>

        {/* Question */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-foreground leading-relaxed">
              {currentQuestion.question}
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {currentQuestion.type === 'multiple-choice' && currentQuestion.options?.map((option, index) => (
            <div
              key={index}
              onClick={() => !showFeedback && setSelectedAnswer(option)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                selectedAnswer === option
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50",
                showFeedback && option === currentQuestion.correctAnswer
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : showFeedback && selectedAnswer === option && !answers.find(a => a.questionId === currentQuestion.id)?.isCorrect && selectedAnswer === option
                  ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                  : ""
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                selectedAnswer === option ? "border-primary bg-primary" : "border-muted-foreground",
                showFeedback && option === currentQuestion.correctAnswer && "border-green-500 bg-green-500",
                showFeedback && selectedAnswer === option && option !== currentQuestion.correctAnswer && "border-red-500 bg-red-500"
              )}>
                {showFeedback && option === currentQuestion.correctAnswer && (
                  <CheckCircle2 className="h-3 w-3 text-white" />
                )}
                {showFeedback && selectedAnswer === option && option !== currentQuestion.correctAnswer && (
                  <XCircle className="h-3 w-3 text-white" />
                )}
                {!showFeedback && selectedAnswer === option && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <span className={cn(
                "text-sm",
                showFeedback && option === currentQuestion.correctAnswer && "text-green-700 dark:text-green-300 font-medium"
              )}>
                {option}
              </span>
            </div>
          ))}

          {currentQuestion.type === 'true-false' && ['True', 'False'].map((option) => (
            <div
              key={option}
              onClick={() => !showFeedback && setSelectedAnswer(option)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                selectedAnswer === option
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50",
                showFeedback && option === currentQuestion.correctAnswer
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : showFeedback && selectedAnswer === option && option !== currentQuestion.correctAnswer
                  ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                  : ""
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                selectedAnswer === option ? "border-primary bg-primary" : "border-muted-foreground",
                showFeedback && option === currentQuestion.correctAnswer && "border-green-500 bg-green-500",
                showFeedback && selectedAnswer === option && option !== currentQuestion.correctAnswer && "border-red-500 bg-red-500"
              )}>
                {showFeedback && option === currentQuestion.correctAnswer && (
                  <CheckCircle2 className="h-3 w-3 text-white" />
                )}
                {showFeedback && selectedAnswer === option && option !== currentQuestion.correctAnswer && (
                  <XCircle className="h-3 w-3 text-white" />
                )}
                {!showFeedback && selectedAnswer === option && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <span className={cn(
                "text-sm font-medium",
                showFeedback && option === currentQuestion.correctAnswer && "text-green-700 dark:text-green-300"
              )}>
                {option}
              </span>
            </div>
          ))}
        </div>

        {/* Feedback */}
        {showFeedback && (
          <div className={cn(
            "p-4 rounded-xl border animate-in fade-in slide-in-from-bottom-2",
            answers.find(a => a.questionId === currentQuestion.id)?.isCorrect || (selectedAnswer === currentQuestion.correctAnswer)
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
          )}>
            <div className="flex items-center gap-2 mb-2">
              {answers.find(a => a.questionId === currentQuestion.id)?.isCorrect || (selectedAnswer === currentQuestion.correctAnswer) ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-700 dark:text-green-400">Correct!</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-700 dark:text-red-400">Incorrect</span>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {currentQuestion.explanation}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!showFeedback ? (
            <Button
              onClick={handleAnswer}
              disabled={!selectedAnswer}
              className="flex-1"
            >
              Submit Answer
            </Button>
          ) : (
            <Button onClick={handleNext} className="flex-1">
              {currentQuestionIndex < numQuestions - 1 ? (
                <>
                  Next Question
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  See Results
                  <Trophy className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Render finished state
  if (quizState === 'finished') {
    const percentage = Math.round((correctCount / numQuestions) * 100);
    
    return (
      <div className="space-y-6 text-center">
        <div className="p-6">
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4",
            percentage >= 80 ? "bg-green-100 dark:bg-green-900/30" :
            percentage >= 50 ? "bg-yellow-100 dark:bg-yellow-900/30" :
            "bg-red-100 dark:bg-red-900/30"
          )}>
            <Trophy className={cn(
              "h-10 w-10",
              percentage >= 80 ? "text-green-600" :
              percentage >= 50 ? "text-yellow-600" :
              "text-red-600"
            )} />
          </div>
          
          <h2 className="text-2xl font-bold mb-2">
            {percentage >= 80 ? "Excellent!" :
             percentage >= 50 ? "Good job!" :
             "Keep practicing!"}
          </h2>
          
          <p className="text-muted-foreground mb-4">
            You got <span className="font-bold text-foreground">{correctCount}</span> out of <span className="font-bold text-foreground">{numQuestions}</span> questions correct.
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted">
            <span className="text-3xl font-bold">{percentage}%</span>
          </div>
        </div>

        {/* Answer Summary */}
        <div className="text-left space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
          {answers.map((answer, index) => (
            <div key={answer.questionId} className="flex items-center gap-2 text-sm">
              {answer.isCorrect ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span>Question {index + 1}</span>
            </div>
          ))}
        </div>

        <Button onClick={handleRestart} variant="outline" className="w-full">
          <RotateCcw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return null;
}
