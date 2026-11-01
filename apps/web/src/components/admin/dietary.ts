// English labels for the member profile values staff see in the admin.

export const DIET_LABELS: Record<string, string> = {
  VEGETARIAN: 'Vegetarian',
  VEGAN: 'Vegan',
  HALAL: 'Halal',
  GLUTEN_FREE: 'Gluten-free',
};

export const SPICE_LABELS = ['No spice', 'Mild', 'Medium', 'Medium-hot', 'Hot', 'Extra hot'];

export interface DietaryAlert {
  allergens: string[];
  otherAllergies: string;
  diets: string[];
}

/** One line for the kitchen, e.g. "Allergies: えび, 乳, マンゴー · Halal". */
export function alertText(alert: DietaryAlert): string {
  const allergies = [...alert.allergens, ...(alert.otherAllergies ? [alert.otherAllergies] : [])];
  return [allergies.length ? `Allergies: ${allergies.join(', ')}` : '', alert.diets.map(diet => DIET_LABELS[diet] ?? diet).join(', ')]
    .filter(Boolean)
    .join(' · ');
}
