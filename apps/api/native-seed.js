import { MongoClient, ObjectId } from 'mongodb';

const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);

async function run() {
  try {
    await client.connect();
    const db = client.db('adarsharestro');
    console.log("Connected to MongoDB directly.");

    // 1. Create Admin User
    const users = db.collection('User');
    await users.deleteMany({});
    await users.insertOne({
      _id: new ObjectId(),
      email: 'admin@example.com',
      passwordHash: '$2a$10$7b/C9W/d5z/7jCqR4N/.4.4g5bX/Tz/4r/.KqjY./r1g2L/G/.R/.',
      name: 'Adarsha Admin',
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log(`Inserted Admin User`);

    // 2. Create Categories
    const categories = db.collection('Category');
    await categories.deleteMany({});
    
    const catChicken = new ObjectId();
    const catMutton = new ObjectId();
    const catBread = new ObjectId();
    const catLunch = new ObjectId();

    await categories.insertMany([
      { _id: catChicken, nameEn: 'Chicken Curries', nameJa: 'チキンカレー', sortOrder: 1, menuIDs: [] },
      { _id: catMutton, nameEn: 'Mutton Curries', nameJa: 'マトンカレー', sortOrder: 2, menuIDs: [] },
      { _id: catBread, nameEn: 'Breads (Naan)', nameJa: 'ナン', sortOrder: 3, menuIDs: [] },
      { _id: catLunch, nameEn: 'Lunch Sets', nameJa: 'ランチセット', sortOrder: 4, menuIDs: [] }
    ]);
    console.log(`Inserted Categories`);

    // 3. Create Menus (Menu Types)
    const menus = db.collection('Menu');
    await menus.deleteMany({});
    await menus.insertMany([
      { _id: new ObjectId(), type: 'GRAND', nameEn: 'Grand Menu', nameJa: 'グランドメニュー', isActive: true, categoryIDs: [catChicken, catMutton, catBread] },
      { _id: new ObjectId(), type: 'LUNCH', nameEn: 'Lunch Menu', nameJa: 'ランチメニュー', isActive: true, categoryIDs: [catChicken, catBread, catLunch] },
      { _id: new ObjectId(), type: 'TAKEOUT', nameEn: 'Takeout Menu', nameJa: 'テイクアウトメニュー', isActive: true, categoryIDs: [catChicken, catBread] },
    ]);
    console.log(`Inserted Menus`);

    // 4. Create Menu Items
    const menuItems = db.collection('MenuItem');
    await menuItems.deleteMany({});
    
    const item1 = new ObjectId();
    const item2 = new ObjectId();
    
    await menuItems.insertMany([
      {
        _id: item1, categoryId: catChicken, nameEn: 'Butter Chicken Curry', nameJa: 'バターチキンカレー', descriptionEn: 'Creamy and rich tomato based chicken curry',
        price: 1200, spiceLevel: 1, menuTypes: ['GRAND', 'TAKEOUT'], isActive: true, isVegetarian: false, isVegan: false, isHalal: true, isGlutenFree: true, allergens: ['Dairy'], isRecommended: true, isSoldOut: false, sortOrder: 1, createdAt: new Date(), updatedAt: new Date()
      },
      {
        _id: item2, categoryId: catMutton, nameEn: 'Keema Curry', nameJa: 'キーマカレー', descriptionEn: 'Minced mutton curry with peas',
        price: 1100, spiceLevel: 3, menuTypes: ['GRAND'], isActive: true, isVegetarian: false, isVegan: false, isHalal: true, isGlutenFree: true, allergens: [], isRecommended: false, isSoldOut: false, sortOrder: 2, createdAt: new Date(), updatedAt: new Date()
      },
      {
        _id: new ObjectId(), categoryId: catBread, nameEn: 'Garlic Naan', nameJa: 'ガーリックナン', descriptionEn: 'Naan topped with fresh garlic and cilantro',
        price: 400, spiceLevel: 0, menuTypes: ['GRAND', 'TAKEOUT'], isActive: true, isVegetarian: true, isVegan: false, isHalal: true, isGlutenFree: false, allergens: ['Gluten', 'Dairy'], isRecommended: true, isSoldOut: false, sortOrder: 3, createdAt: new Date(), updatedAt: new Date()
      }
    ]);
    console.log(`Inserted Menu Items`);

    // 5. Create Item Variants
    const itemVariants = db.collection('ItemVariant');
    await itemVariants.deleteMany({});
    await itemVariants.insertMany([
      { _id: new ObjectId(), itemId: item1, labelEn: 'Regular', labelJa: 'レギュラー', price: 1200, sortOrder: 1 },
      { _id: new ObjectId(), itemId: item1, labelEn: 'Large', labelJa: '大盛り', price: 1500, sortOrder: 2 },
    ]);
    console.log(`Inserted Item Variants`);

    // 6. Create Settings
    const settings = db.collection('Settings');
    await settings.deleteMany({});
    await settings.insertOne({
      _id: new ObjectId(), name: 'Adarsha Indian Cuisine', addressEn: 'Kumagaya, Saitama, Japan', addressJa: '埼玉県熊谷市', lat: 36.1473, lng: 139.3886, phone: '048-XXX-XXXX', email: 'info@adarshacurry.com', timezone: 'Asia/Tokyo', currency: 'JPY',
      weeklyHours: { monday: "11:00-15:00, 17:00-22:00" }, holidays: { regular: "Tuesday" }, socials: { instagram: "@adarsha_restro" }, updatedAt: new Date()
    });
    console.log(`Inserted Settings`);

    // 7. Create Carousel Slides
    const carousels = db.collection('CarouselSlide');
    await carousels.deleteMany({});
    await carousels.insertMany([
      { _id: new ObjectId(), placement: 'HOME', imageUrl: '/hero1.jpg', altEn: 'Authentic Indian Taste', titleEn: 'Authentic Indian Taste', titleJa: '本格インドの味', isActive: true, sortOrder: 1 },
      { _id: new ObjectId(), placement: 'HOME', imageUrl: '/hero2.jpg', altEn: 'Lunch Special', titleEn: 'Lunch Special', titleJa: 'ランチスペシャル', isActive: true, sortOrder: 2 },
    ]);
    console.log(`Inserted Carousel Slides`);

    // 8. Create Contact Messages
    const messages = db.collection('ContactMessage');
    await messages.deleteMany({});
    await messages.insertMany([
      { _id: new ObjectId(), name: 'John Doe', email: 'john@example.com', type: 'RESERVATION', message: 'I would like to book a table for 4 tonight.', isRead: false, createdAt: new Date() },
      { _id: new ObjectId(), name: 'Jane Smith', email: 'jane@example.com', type: 'GENERAL', message: 'Do you have vegan options?', isRead: true, createdAt: new Date() },
    ]);
    console.log(`Inserted Contact Messages`);

    // 9. Create Audit Log
    const logs = db.collection('AuditLog');
    await logs.deleteMany({});
    await logs.insertOne({
      _id: new ObjectId(), userId: new ObjectId(), action: 'SEED', entity: 'ALL', entityId: '0', createdAt: new Date()
    });
    console.log(`Inserted Audit Logs`);

  } finally {
    await client.close();
  }
}

run().catch(console.dir);
