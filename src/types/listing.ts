// Airbnb listing types

export interface SearchParams {
  location: string;
  checkIn: string; // ISO date YYYY-MM-DD
  checkOut: string; // ISO date YYYY-MM-DD
  guests: number; // default 2
  budgetMin?: number | null; // per night
  budgetMax?: number | null; // per night
  currency: string; // ISO 4217, default USD
}

export interface Listing {
  title: string;
  pricePerNight: number;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  reviewSummary: string | null;
  url: string;
  imageUrl?: string | null; // Primary listing image
}

export interface Review {
  text: string;
  rating?: number;
  date?: string;
  author?: string;
}

export interface ListingDetail extends Listing {
  reviews: Review[]; // >= 10 reviews when available
  description?: string;
  amenities?: string[];
}

export interface SearchContext {
  location: string;
  checkIn: string;
  checkOut: string;
  hadBudget: boolean;
  budgetRelaxed: boolean;
}
