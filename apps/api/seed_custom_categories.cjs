const { MongoClient, ObjectId } = require('mongodb');

async function seedCategories() {
  const client = new MongoClient('mongodb://localhost:27017/adarsharestro');
  try {
    await client.connect();
    const db = client.db();
    
    // Clear existing categories
    await db.collection('Category').deleteMany({});
    
    // Desired Categories
    const categories = [
      { nameEn: "Dinner Set", nameJa: "ディナーセット", sortOrder: 1 },
      { nameEn: "Salad", nameJa: "サラダ", sortOrder: 2 },
      { nameEn: "Tandoor", nameJa: "タンドール", sortOrder: 3 },
      { nameEn: "Lunch Menu", nameJa: "ランチメニュー", sortOrder: 4 },
      { nameEn: "Lunch Takeout", nameJa: "ランチテイクアウト", sortOrder: 5 },
      { nameEn: "Dinner Takeout", nameJa: "ディナーテイクアウト", sortOrder: 6 }
    ];
    
    for (const cat of categories) {
      await db.collection('Category').insertOne({
        _id: new ObjectId(),
        nameEn: cat.nameEn,
        nameJa: cat.nameJa,
        sortOrder: cat.sortOrder,
        menuIDs: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`Created category: ${cat.nameEn}`);
    }
    
    console.log('Finished seeding custom categories.');
  } catch (error) {
    console.error('Error seeding categories:', error);
  } finally {
    await client.close();
  }
}

seedCategories();
