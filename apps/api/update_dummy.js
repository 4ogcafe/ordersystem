const { MongoClient } = require('mongodb');
async function run() {
  const client = new MongoClient('mongodb://localhost:27017/adarsharestro');
  await client.connect();
  const db = client.db();
  await db.collection('Settings').updateOne({}, {
    $set: {
      welcomeTitleEn: "Authentic Indian Flavors",
      welcomeTitleJa: "本格インドの味わい",
      welcomeTextEn: "Experience the vibrant spices and rich culinary heritage of India. Our master chefs prepare every dish from scratch, using traditional tandoor ovens and the freshest ingredients to bring you a truly unforgettable dining experience.",
      welcomeTextJa: "インドの豊かな食文化と鮮やかなスパイスを体験してください。熟練のシェフが伝統的なタンドール窯と新鮮な食材を使用し、すべての料理をゼロから手作りしています。忘れられない特別なひとときをお届けします。"
    }
  });
  console.log("Updated!");
  await client.close();
}
run();
