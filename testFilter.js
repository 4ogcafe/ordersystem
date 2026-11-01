const fs = require('fs');
fetch('http://localhost:4000/api/v1/menu/items')
  .then(res => res.json())
  .then(menuItems => {
    const menuTypeEnum = 'GRAND';
    const filteredItems = menuItems.filter(item => {
      if (item.menuTypes && item.menuTypes.includes(menuTypeEnum)) {
        return true;
      }
      const catName = (item.category?.nameEn || '').toLowerCase();
      if (menuTypeEnum === 'LUNCH') {
        return catName.includes('lunch') && !catName.includes('takeout');
      }
      if (menuTypeEnum === 'TAKEOUT') {
        return catName.includes('takeout');
      }
      if (menuTypeEnum === 'GRAND') {
        return !catName.includes('lunch') && !catName.includes('takeout');
      }
      return false;
    });
    console.log(`Total items: ${menuItems.length}`);
    console.log(`Grand menu items: ${filteredItems.length}`);
    const categoriesMap = new Map();
    filteredItems.forEach(item => {
      const catId = item.category?.id || 'other';
      if (!categoriesMap.has(catId)) categoriesMap.set(catId, { id: catId, name: item.category?.nameEn, items: [] });
      categoriesMap.get(catId).items.push(item.nameEn);
    });
    console.log('Categories:', Array.from(categoriesMap.values()).map(c => `${c.name}: ${c.items.length}`));
  });
