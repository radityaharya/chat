import { z } from 'zod';
import { type LocalTool } from '../types';

export const loremTool: LocalTool = {
  name: 'generate_lorem_ipsum',
  description: 'Generate Lorem Ipsum placeholder text',
  parameters: z.object({
    paragraphs: z.number().min(1).max(10).default(1).describe('Number of paragraphs to generate'),
    sentence_count: z.number().min(1).max(20).default(5).describe('Number of sentences per paragraph'),
  }),
  execute: ({ paragraphs = 1, sentence_count = 5 }: { paragraphs?: number; sentence_count?: number }) => {
    const words = [
      'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
      'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
      'magna', 'aliqua', 'ut', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
      'exercitation', 'ullamco', 'laboris', 'nisi', 'ut', 'aliquip', 'ex', 'ea',
      'commodo', 'consequat', 'duis', 'aute', 'irure', 'dolor', 'in', 'reprehenderit',
      'in', 'voluptate', 'velit', 'esse', 'cillum', 'dolore', 'eu', 'fugiat', 'nulla',
      'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat', 'non', 'proident',
      'sunt', 'in', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum'
    ];

    const generateSentence = () => {
      const length = Math.floor(Math.random() * 10) + 5;
      const sentenceWords = [];
      for (let i = 0; i < length; i++) {
        sentenceWords.push(words[Math.floor(Math.random() * words.length)]);
      }
      const sentence = sentenceWords.join(' ');
      return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
    };

    const result = [];
    for (let i = 0; i < paragraphs; i++) {
      const paragraph = [];
      for (let j = 0; j < sentence_count; j++) {
        paragraph.push(generateSentence());
      }
      result.push(paragraph.join(' '));
    }

    return {
      text: result.join('\n\n'),
      paragraphs: result.length,
    };
  },
};
