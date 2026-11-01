/**
 * Resolves a context-specific emoji icon for menu categories/subcategories.
 * Automatically maps Japanese & English names to appropriate food/drink emojis.
 */
export function getCategoryIcon(nameJa?: string | null, nameEn?: string | null): string {
  const text = `${nameJa || ''} ${nameEn || ''}`.trim();
  if (!text) return '🍛';

  // If the category name already starts with or contains an emoji, use it directly
  const emojiMatch = text.match(/(\p{Extended_Pictographic})/u);
  if (emojiMatch) return emojiMatch[1];

  const lower = text.toLowerCase();

  // 1. Tandoori / Charcoal / Grill / BBQ / Tikka / Kebab
  if (
    lower.includes('タンドリー') ||
    lower.includes('タンドール') ||
    lower.includes('炭火') ||
    lower.includes('グリル') ||
    lower.includes('ティッカ') ||
    lower.includes('tikka') ||
    lower.includes('tandoor') ||
    lower.includes('grill') ||
    lower.includes('bbq') ||
    lower.includes('kebab') ||
    lower.includes('ケバブ') ||
    lower.includes('カバブ')
  ) {
    return '🍗';
  }

  // 2. Alcohol / Beer / Wine / Highball / Cocktail / Sours
  if (
    lower.includes('アルコール') ||
    lower.includes('生ビール') ||
    lower.includes('ビール') ||
    lower.includes('ハイボール') ||
    lower.includes('サワー') ||
    lower.includes('カクテル') ||
    lower.includes('ワイン') ||
    lower.includes('焼酎') ||
    lower.includes('日本酒') ||
    lower.includes('お酒') ||
    lower.includes('alcohol') ||
    lower.includes('beer') ||
    lower.includes('wine') ||
    lower.includes('cocktail') ||
    lower.includes('highball') ||
    lower.includes('whisky') ||
    lower.includes('whiskey') ||
    lower.includes('liquor') ||
    lower.includes('sake')
  ) {
    return '🍺';
  }

  // 3. Soft Drinks / Juice / Lassi / Soda
  if (
    lower.includes('ソフトドリンク') ||
    lower.includes('ジュース') ||
    lower.includes('ラッシー') ||
    lower.includes('コーラ') ||
    lower.includes('ソーダ') ||
    lower.includes('ドリンク') ||
    lower.includes('飲料') ||
    lower.includes('soft drink') ||
    lower.includes('softdrink') ||
    lower.includes('drink') ||
    lower.includes('juice') ||
    lower.includes('lassi') ||
    lower.includes('soda') ||
    lower.includes('beverage')
  ) {
    return '🥤';
  }

  // 4. Tea / Chai / Coffee
  if (
    lower.includes('チャイ') ||
    lower.includes('コーヒー') ||
    lower.includes('カフェ') ||
    lower.includes('お茶') ||
    lower.includes('紅茶') ||
    lower.includes('chai') ||
    lower.includes('tea') ||
    lower.includes('coffee')
  ) {
    return '☕';
  }

  // 5. Dessert / Sweets / Ice Cream
  if (
    lower.includes('デザート') ||
    lower.includes('スイーツ') ||
    lower.includes('アイス') ||
    lower.includes('ケーキ') ||
    lower.includes('プリン') ||
    lower.includes('クルフィ') ||
    lower.includes('クフィ') ||
    lower.includes('ハルワ') ||
    lower.includes('dessert') ||
    lower.includes('sweet') ||
    lower.includes('ice cream') ||
    lower.includes('icecream') ||
    lower.includes('cake') ||
    lower.includes('kulfi') ||
    lower.includes('halwa')
  ) {
    return '🍨';
  }

  // 6. Momo (Nepalese dumplings)
  if (
    lower.includes('モモ') ||
    lower.includes('momo') ||
    lower.includes('餃子')
  ) {
    return '🥟';
  }

  // 7. Otsumami / Snacks / Appetizers / Samosa / Pakora / Papad
  if (
    lower.includes('おつまみ') ||
    lower.includes('つまみ') ||
    lower.includes('スナック') ||
    lower.includes('アペタイザー') ||
    lower.includes('前菜') ||
    lower.includes('一品') ||
    lower.includes('サモサ') ||
    lower.includes('パパド') ||
    lower.includes('パコラ') ||
    lower.includes('otsumami') ||
    lower.includes('snack') ||
    lower.includes('appetizer') ||
    lower.includes('starter') ||
    lower.includes('side') ||
    lower.includes('samosa') ||
    lower.includes('papad') ||
    lower.includes('pakora')
  ) {
    return '🧆';
  }

  // 7. Naan / Breads / Roti / Paratha
  if (
    lower.includes('ナン') ||
    lower.includes('ロティ') ||
    lower.includes('パラタ') ||
    lower.includes('クルチャ') ||
    lower.includes('パン') ||
    lower.includes('ブレッド') ||
    lower.includes('naan') ||
    lower.includes('nan') ||
    lower.includes('roti') ||
    lower.includes('paratha') ||
    lower.includes('kulcha') ||
    lower.includes('bread') ||
    lower.includes('flatbread')
  ) {
    return '🫓';
  }

  // 8. Rice / Biryani / Pulao
  if (
    lower.includes('ライス') ||
    lower.includes('ご飯') ||
    lower.includes('ごはん') ||
    lower.includes('ビリヤニ') ||
    lower.includes('ピラフ') ||
    lower.includes('プラオ') ||
    lower.includes('チャーハン') ||
    lower.includes('米') ||
    lower.includes('rice') ||
    lower.includes('biryani') ||
    lower.includes('pulao') ||
    lower.includes('pilaf')
  ) {
    return '🍚';
  }

  // 9. Salad
  if (
    lower.includes('サラダ') ||
    lower.includes('salad') ||
    lower.includes('greens')
  ) {
    return '🥗';
  }

  // 10. Dinner Set / Lunch Set / Set Menu / Thali / Course
  if (
    lower.includes('ディナーセット') ||
    lower.includes('ランチセット') ||
    lower.includes('セット') ||
    lower.includes('コース') ||
    lower.includes('ターリー') ||
    lower.includes('定食') ||
    lower.includes('set') ||
    lower.includes('thali') ||
    lower.includes('course') ||
    lower.includes('combo')
  ) {
    return '🍽️';
  }

  // 11. Soup
  if (lower.includes('スープ') || lower.includes('soup')) {
    return '🥣';
  }

  // 12. Noodles / Chowmein
  if (
    lower.includes('麺') ||
    lower.includes('ラーメン') ||
    lower.includes('チョウミン') ||
    lower.includes('noodle') ||
    lower.includes('chowmein')
  ) {
    return '🍜';
  }

  // 13. Seafood / Prawn / Shrimp / Fish
  if (
    lower.includes('シーフード') ||
    lower.includes('海鮮') ||
    lower.includes('エビ') ||
    lower.includes('海老') ||
    lower.includes('魚') ||
    lower.includes('フィッシュ') ||
    lower.includes('seafood') ||
    lower.includes('prawn') ||
    lower.includes('shrimp') ||
    lower.includes('fish')
  ) {
    return '🦐';
  }

  // 14. Meat / Mutton / Pork / Beef
  if (
    lower.includes('マトン') ||
    lower.includes('羊') ||
    lower.includes('ポーク') ||
    lower.includes('豚') ||
    lower.includes('ビーフ') ||
    lower.includes('牛') ||
    lower.includes('肉') ||
    lower.includes('mutton') ||
    lower.includes('lamb') ||
    lower.includes('pork') ||
    lower.includes('beef') ||
    lower.includes('meat')
  ) {
    return '🥩';
  }

  // 15. Chicken
  if (
    lower.includes('チキン') ||
    lower.includes('鶏') ||
    lower.includes('chicken')
  ) {
    return '🍗';
  }

  // 16. Vegetable
  if (
    lower.includes('野菜') ||
    lower.includes('ベジタブル') ||
    lower.includes('ベジ') ||
    lower.includes('vegetable') ||
    lower.includes('veggie') ||
    lower.includes('veg')
  ) {
    return '🥦';
  }

  // 17. Kids / Child
  if (
    lower.includes('キッズ') ||
    lower.includes('お子様') ||
    lower.includes('こども') ||
    lower.includes('子供') ||
    lower.includes('kids') ||
    lower.includes('child')
  ) {
    return '🧒';
  }

  // 18. Takeout / Bento
  if (
    lower.includes('テイクアウト') ||
    lower.includes('持ち帰り') ||
    lower.includes('弁当') ||
    lower.includes('takeout') ||
    lower.includes('bento')
  ) {
    return '🥡';
  }

  // 19. Curry (default fallback for curry house)
  if (
    lower.includes('カレー') ||
    lower.includes('カリー') ||
    lower.includes('キーマ') ||
    lower.includes('マサラ') ||
    lower.includes('ダル') ||
    lower.includes('curry') ||
    lower.includes('masala') ||
    lower.includes('dal') ||
    lower.includes('korma')
  ) {
    return '🍛';
  }

  return '🍛';
}
