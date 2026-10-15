import { describe, expect, it } from 'vitest';
import { applyPolicyFloors, classifyByRules } from './rules.js';

describe('classifyByRules (fallback when AI is unavailable)', () => {
  it.each([
    ['I have never received a single royalty payment and my dashboard shows ₹2,546 pending.', 'ROYALTY_PAYMENTS'],
    ['When will I receive royalties? Nothing has been paid into my account yet.', 'ROYALTY_PAYMENTS'],
    ["It's been 3 weeks and my book is still in typesetting. When will it be done?", 'BOOK_STATUS_PRODUCTION'],
    ["The ISBN on the Amazon listing is different from my printed copies. A store couldn't find it.", 'ISBN_METADATA'],
    ['The print quality of my author copies is terrible: images are blurry and pages misaligned.', 'PRINTING_QUALITY'],
    ["My book shows 'Currently Unavailable' on Amazon India and readers can't order it.", 'DISTRIBUTION_AVAILABILITY'],
    ['I have a new author photo and an updated bio. Can I change these on my Amazon author page?', 'GENERAL_INQUIRY'],
    ['I approved the second cover concept last week. When does typesetting start?', 'BOOK_STATUS_PRODUCTION'],
    ['Hello, I have a question.', 'GENERAL_INQUIRY'],
  ])('%s → %s', (text, category) => {
    expect(classifyByRules(text).category).toBe(category);
  });

  it('explains that rules were used', () => {
    expect(classifyByRules('my royalty is missing').reasoning).toMatch(/^Keyword rules \(AI unavailable\)/);
  });
});

describe('applyPolicyFloors', () => {
  const base = { reasoning: 'Model reasoning.', payoutState: 'SCHEDULED' as const };

  it('raises ISBN errors to at least High', () => {
    const result = applyPolicyFloors(
      { category: 'ISBN_METADATA', priority: 'MEDIUM', reasoning: base.reasoning },
      { text: 'The ISBN on Amazon is different from my book', payoutState: base.payoutState },
    );
    expect(result.priority).toBe('HIGH');
    expect(result.reasoning).toContain('Raised to High: BookLeaf policy treats ISBN errors as high priority');
  });

  it('leaves ISBN questions that are not errors alone', () => {
    const result = applyPolicyFloors(
      { category: 'ISBN_METADATA', priority: 'LOW', reasoning: base.reasoning },
      { text: 'Can I use an ISBN from my own imprint for my next book?', payoutState: base.payoutState },
    );
    expect(result.priority).toBe('LOW');
  });

  it('raises royalty tickets with a possibly missed payout to High', () => {
    const triage = { category: 'ROYALTY_PAYMENTS' as const, priority: 'MEDIUM' as const, reasoning: base.reasoning };
    expect(applyPolicyFloors(triage, { text: 'where is my money', payoutState: 'NEEDS_REVIEW' }).priority).toBe('HIGH');
    expect(applyPolicyFloors(triage, { text: 'where is my money', payoutState: 'BELOW_MINIMUM' }).priority).toBe('MEDIUM');
  });

  it('never lowers a priority', () => {
    const result = applyPolicyFloors(
      { category: 'ISBN_METADATA', priority: 'CRITICAL', reasoning: base.reasoning },
      { text: 'wrong ISBN', payoutState: base.payoutState },
    );
    expect(result.priority).toBe('CRITICAL');
  });
});
