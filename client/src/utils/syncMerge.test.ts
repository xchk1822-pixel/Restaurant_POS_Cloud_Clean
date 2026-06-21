import { mergeRecordsByVersion } from './syncMerge';

describe('mergeRecordsByVersion', () => {
  test('preserves cloud image fields when a newer local menu record has no image', () => {
    const merged = mergeRecordsByVersion(
      [
        {
          id: 'menu-1',
          name: 'Coca Cola',
          price: 35,
          lastModified: 3000,
        },
      ],
      [
        {
          id: 'menu-1',
          name: 'Coca Cola',
          price: 35,
          imageUrl: 'https://storage.example/menu-1.jpg',
          imageStoragePath: 'stores/store-1/menu-images/menu-1/original-2000.jpg',
          imageUpdatedAt: 2000,
          lastModified: 2000,
        },
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'menu-1',
      name: 'Coca Cola',
      price: 35,
      lastModified: 3000,
      imageUrl: 'https://storage.example/menu-1.jpg',
      imageStoragePath: 'stores/store-1/menu-images/menu-1/original-2000.jpg',
      imageUpdatedAt: 2000,
    });
  });

  test('uses completed cloud upload when local image is still marked pending', () => {
    const merged = mergeRecordsByVersion(
      [
        {
          id: 'menu-1',
          name: 'Coca Cola',
          price: 35,
          imageUpdatedAt: 2000,
          imageUploadPending: true,
          lastModified: 3000,
        },
      ],
      [
        {
          id: 'menu-1',
          name: 'Coca Cola',
          price: 35,
          imageUrl: 'https://storage.example/menu-1.jpg',
          imageStoragePath: 'stores/store-1/menu-images/menu-1/original-2000.jpg',
          imageUpdatedAt: 2000,
          imageUploadPending: false,
          lastModified: 2500,
        },
      ]
    );

    expect(merged[0]).toMatchObject({
      imageUrl: 'https://storage.example/menu-1.jpg',
      imageUploadPending: false,
      imageUpdatedAt: 2000,
    });
  });
});
