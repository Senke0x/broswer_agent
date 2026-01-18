// Review summarizer using OpenAI

import { Review } from '@/types/listing';
import { getOpenAIClient, DEFAULT_MODEL } from './client';

/**
 * Summarize reviews for a listing
 * Takes 10+ reviews and generates a concise summary
 */
export async function summarizeReviews(
  reviews: Review[],
  listingTitle: string
): Promise<string> {
  try {
    // If no reviews, return default message
    if (reviews.length === 0) {
      return 'No reviews available for this listing.';
    }

    // Prepare review text
    const reviewTexts = reviews
      .slice(0, 15) // Use up to 15 reviews for summary
      .map((review, idx) => `Review ${idx + 1}: ${review.text}`)
      .join('\n\n');

    const prompt = `Summarize the following reviews for "${listingTitle}" in 2-3 sentences. Focus on common themes, pros, and cons mentioned by guests.

${reviewTexts}

Summary:`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes Airbnb reviews concisely and objectively.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 150,
    });

    return response.choices[0].message.content || 'Unable to generate summary.';

  } catch (error) {
    console.error('Review summarization error:', error);
    return 'Unable to summarize reviews at this time.';
  }
}
