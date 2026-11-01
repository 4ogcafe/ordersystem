import bcrypt from 'bcryptjs';
import { PrismaClient, MenuType, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Create Admin User
  let admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        passwordHash: await bcrypt.hash('admin123', 10),
        name: 'Adarsha Admin',
        role: Role.ADMIN,
      },
    });
  }
  console.log(`Created admin user with id: ${admin.id}`);

  // 2. Create Categories
  const catChicken = await prisma.category.create({ data: { nameEn: 'Chicken Curries', nameJa: 'チキンカレー', sortOrder: 1 } });
  const catMutton = await prisma.category.create({ data: { nameEn: 'Mutton Curries', nameJa: 'マトンカレー', sortOrder: 2 } });
  const catBread = await prisma.category.create({ data: { nameEn: 'Breads (Naan)', nameJa: 'ナン', sortOrder: 3 } });
  const catLunch = await prisma.category.create({ data: { nameEn: 'Lunch Sets', nameJa: 'ランチセット', sortOrder: 4 } });
  console.log('Created categories');

  // 3. Create Menu Items
  await prisma.menuItem.create({
    data: { categoryId: catChicken.id, nameEn: 'Butter Chicken Curry', nameJa: 'バターチキンカレー', descriptionEn: 'Creamy and rich tomato based chicken curry', price: 1200, spiceLevel: 1, menuTypes: [MenuType.GRAND, MenuType.TAKEOUT], allergens: [] }
  });
  await prisma.menuItem.create({
    data: { categoryId: catMutton.id, nameEn: 'Keema Curry', nameJa: 'キーマカレー', descriptionEn: 'Minced mutton curry with peas', price: 1100, spiceLevel: 3, menuTypes: [MenuType.GRAND], allergens: [] }
  });
  await prisma.menuItem.create({
    data: { categoryId: catBread.id, nameEn: 'Garlic Naan', nameJa: 'ガーリックナン', descriptionEn: 'Naan topped with fresh garlic and cilantro', price: 400, spiceLevel: 0, menuTypes: [MenuType.GRAND, MenuType.TAKEOUT], allergens: [] }
  });
  await prisma.menuItem.create({
    data: { categoryId: catLunch.id, nameEn: 'Lunch Set A', nameJa: 'ランチセット A', descriptionEn: 'One curry of your choice, plain naan, and mini salad', price: 950, spiceLevel: 0, menuTypes: [MenuType.LUNCH], allergens: [] }
  });
  console.log('Created menu items');

  // 4. Create Settings
  await prisma.settings.create({
    data: {
      name: 'Adarsha Indian Cuisine',
      addressEn: '2081 Sayada, Kumagaya, Saitama 360-0023, Japan',
      addressJa: '〒360-0023 埼玉県熊谷市佐谷田2081',
      lat: 36.1250995,
      lng: 139.4214049,
      phone: '048-577-7497',
      email: 'info@adarshacurry.com',
      timezone: 'Asia/Tokyo',
      currency: 'JPY',
      weeklyHours: { monday: '11:00-15:00, 17:00-22:00' },
      holidays: { regular: 'Tuesday' },
      socials: { instagram: '@adarsha_restro' },
      pickupEnabled: false,
      pickupHours: '11:00-14:30, 17:00-21:30',
      pickupLeadMinutes: 30,
      pickupClosedDays: [2],   // Tuesday
      taxRatePercent: 8,
      googlePlaceId: 'ChIJH2xEBQYrH2AR1rPBoQakMRo',
      googleMapsLink: 'https://www.google.com/maps/place/Adarsha+Indian+Cuisine/@36.1250995,138.8116637,10z/data=!4m6!3m5!1s0x601f2b0605446c1f:0x1a31a406a1c1b3d6!8m2!3d36.1250995!4d139.4214049!16s%2Fg%2F11mf64qypb?entry=ttu',
      mapUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3221.724944983944!2d139.41883000000002!3d36.1251!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x601f2b0605446c1f%3A0x1a31a406a1c1b3d6!2sAdarsha%20Indian%20Cuisine!5e0!3m2!1sen!2sus!4v1700000000000!5m2!1sen!2sus',
      heroTagJa: '埼玉・熊谷で味わう、本場のインド料理',
      heroSubJa: '愛とスパイス、そして伝統に彩られた数世紀にわたるレシピを。\nAdarsha Indian Cuisineで皆様をお待ちしております。',
      welcomeTitleEn: 'Authentic Indian Flavors',
      welcomeTitleJa: '本格インドの味わい',
      welcomeTextJa: 'インドの豊かな食文化と鮮やかなスパイスを体験してください。熟練のシェフが伝統的なタンドール窯と新鮮な食材を使用し、すべての料理をゼロから手作りしています。忘れられない特別なひとときをお届けします。',
      menuExplorerLabelJa: 'メニューを見る',
      menuExplorerTitleJa: 'キッチンからお届け',
      aboutJa: '毎日手作りの新鮮な味 — 手挽きのスパイス、本格的な粘土窯（タンドール）、妥協のない調理',
      recommendedLabelJa: 'シェフの厳選',
      recommendedTitleJa: 'おすすめメニュー',
      recommendedSubJa: '全店舗で愛され続けている、不動の人気メニュー',
      storeSectionLabelJa: '店舗を探す',
      storeSectionTitleJa: '私たちの店舗',
      storeSectionSubJa: '店舗を選択して、住所、営業時間、地図をご確認ください。',
      storeLocationJa: '埼玉県熊谷市佐谷田2081（国道17号沿い・加賀家食堂隣）',
      storeBadgeJa: '🍛 インド料理',
      storeReviewScore: '4.5',
      storeReviewCount: 185,
      storeReviewText: 'Googleでレビューを見る',
      storeReviewLink: 'https://www.google.com/maps/place/Adarsha+Indian+Cuisine/@36.1250995,138.8116637,10z/data=!4m6!3m5!1s0x601f2b0605446c1f:0x1a31a406a1c1b3d6!8m2!3d36.1250995!4d139.4214049!16s%2Fg%2F11mf64qypb?entry=ttu',
      featuredReviews: [
        {
          authorName: '田中 健一',
          rating: 5,
          dateLabel: '1か月前',
          text: '国道17号沿いにできた本格インド料理店。バターチキンカレーとチーズナンが最高！チーズが溢れるほど入っていてナンだけでも美味しくいただけます。ランチはおかわり無料でコスパも抜群。スタッフさんも笑顔でとても親切です。',
        },
        {
          authorName: '佐藤 美咲',
          rating: 5,
          dateLabel: '2か月前',
          text: 'ダブルカレーランチ（チキンマサラと日替わり）をいただきました。炭火タンドールで焼かれたナンは熱々で香ばしく、モッチモチで大満足！辛さも選べるので辛口にしましたが、スパイスのコクがしっかり効いていて深みがあります。',
        },
        {
          authorName: '高橋 裕太',
          rating: 5,
          dateLabel: '3か月前',
          text: '熊谷で一番美味しいインドカレーに出会えました。炭焼きのタンドリーチキンもジューシーで香辛料の香りがたまりません。駐車場も12台分あって入りやすく、店内も清潔で居心地が良いです。',
        },
        {
          authorName: '鈴木 あゆみ',
          rating: 5,
          dateLabel: '3か月前',
          text: '家族でディナーに伺いました。ビリヤニとサグチキンカレー、グリーンナンを注文。どれも本場の味わいで感動しました！スタッフの方の温かい接客にも癒やされます。テイクアウトもできるのでまた利用します。',
        },
        {
          authorName: '渡辺 翔',
          rating: 5,
          dateLabel: '4か月前',
          text: '加賀家食堂の隣にオープンしたアダルサさん。キーマカレーとプレーンナンを注文。ナンが大きくてびっくり！焼き立ての香ばしさとほのかな甘みがカレーと絶妙にマッチしています。チャイもスパイスが香って美味しかった。',
        },
        {
          authorName: '山田 浩二',
          rating: 5,
          dateLabel: '4か月前',
          text: '焼きたてナンの食べ放題（お代わり無料）が素晴らしい！超激辛（Lv5）を注文しましたが、ただ辛いだけでなくスパイスの旨みと深いコクが凝縮されていて病みつきになります。店員さんも気さくに声をかけてくれて居心地が良いです。',
        },
        {
          authorName: '中村 陽菜',
          rating: 5,
          dateLabel: '5か月前',
          text: '店内は明るく綺麗で、温かい照明で女性ひとりでも入りやすい落ち着いた雰囲気です。レディースセットのマンゴーラッシーとチーズナンが絶品でした！店員さんも日本語がとても上手で親切です。',
        },
        {
          authorName: '小林 誠',
          rating: 5,
          dateLabel: '5か月前',
          text: 'テイクアウトでチキンティッカとマトンカレーを利用しました。持ち帰りでもナンがふっくら温かく、お肉も柔らかくて感動。国道17号沿いでアクセスも良く、熊谷で本格カレー食べるなら間違いなくアダルサさんです。',
        },
      ],
      newsletterTitleJa: 'ニュースレターに登録',
      newsletterSubJa: '最新のメニュー、シークレットレシピ、そして限定のお得な情報を\nあなたのメールボックスへ直接お届けします。',
      aboutHeroTag: 'ABOUT US',
      aboutHeroTitle: '私たちについて',
      aboutHeroImage: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1920&q=80',
      aboutStoryLabelJa: '私たちの物語',
      aboutStoryTitleJa: '本場インドの味を、熊谷へ',
      aboutStoryJa: 'Adarsha（アダルサ）は、サンスクリット語で「理想」や「模範」を意味します。\n私たちは、インドの伝統的なスパイスと製法を守りながら、日本の皆さまの味覚に寄り添う新しいインディアン・ダイニングを創造しています。\n\n本場インドのホテルで腕を磨いたシェフが、厳選された数十種類のスパイスを巧みにブレンド。\n特注のタンドール（土窯）で焼き上げる備長炭の香ばしいナンやタンドリーチキンは、多くのお客様に愛されています。',
      aboutSpiceLabelJa: 'こだわり',
      aboutSpiceTitleJa: '命を吹き込む、スパイス',
      aboutSpiceDescJa: 'カレーの味の決め手となるスパイスは、インドから直接取り寄せた最高品質のものを使用しています。クミン、コリアンダー、ターメリック、カルダモン... それぞれのスパイスが持つ薬効や香りを最大限に引き出すため、独自に配合し、挽きたてを使用しています。',
      aboutSpiceImage: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80',
      aboutChefLabelJa: 'シェフ紹介',
      aboutChefTitleJa: '熟練の技',
      aboutChefDescJa: '長年の経験を積み、日本の皆さまに「本物のインド料理」を届けるために来日しました。カレーの奥深さ、スパイスの魔法、そしてインドの温かいおもてなしの心を、一皿一皿に込めて提供しています。辛さの調節や、ベジタリアン対応などもお気軽にお声がけください。',
      aboutChefImage: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=80',
    }
  });
  console.log('Created settings');

  // 5. Create Carousel Slides
  const slideCount = await prisma.carouselSlide.count();
  if (slideCount === 0) {
    await prisma.carouselSlide.createMany({
      data: [
        {
          placement: 'HOME',
          imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Authentic Indian Flavors',
          titleJa: 'インドの香りを、そのままに',
          altEn: 'Authentic Indian restaurant atmosphere with traditional dishes',
          isActive: true,
          sortOrder: 0,
        },
        {
          placement: 'HOME',
          imageUrl: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Freshly Baked Naan & Curries',
          titleJa: '焼きたてナンと本格スパイスカレー',
          altEn: 'Freshly baked tandoori naan and rich curry bowls',
          isActive: true,
          sortOrder: 1,
        },
        {
          placement: 'HOME',
          imageUrl: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Traditional Charcoal Tandoor',
          titleJa: '炭火粘土窯で焼き上げるタンドール料理',
          altEn: 'Master chef preparing tandoori specialties in traditional clay oven',
          isActive: true,
          sortOrder: 2,
        },
        {
          placement: 'CONTACT',
          imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80',
          titleEn: 'Visit Adarsha in Kumagaya',
          titleJa: '熊谷でお待ちしております',
          altEn: 'Adarsha Indian Cuisine dining hall in Kumagaya',
          isActive: true,
          sortOrder: 0,
        },
      ],
    });
    console.log('Created default carousel slides');
  }

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
