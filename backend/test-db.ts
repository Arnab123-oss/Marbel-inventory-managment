import 'dotenv/config';
import {connectDB} from './config/db.ts';
import Branch from './models/Branch.ts';
import Product from './models/Product.ts';
import Slab from './models/Slab.ts';
import {getStore, initializeStorePersistence} from './services/storeService.ts';

async function testDbConnection() {
  console.log('--- StonePulse Backend Stack Readiness Check ---');
  const status = await connectDB();
  await initializeStorePersistence();
  const store = getStore();

  console.log('Primary Database Driver:', status.driver);
  console.log('MongoDB Atlas Connected:', status.mongoConnected);
  console.log('MongoDB Host:', status.mongoHost ?? '(MONGODB_URI not configured yet)');
  console.log('Firebase Auth Ready (optional):', status.firebase.authReady);
  console.log('Firebase Storage Ready (optional):', status.firebase.storageReady);
  console.log('Firebase Project ID:', status.firebase.projectId ?? '(not linked yet)');
  console.log('Local ledger fallback path:', status.storePath);
  console.log('Loaded Mongoose/Ledger counts:', {
    users: Object.keys(store.users).length,
    branches: Branch.findAll().length,
    products: Product.findAll().length,
    slabs: Slab.findAll().length,
    purchaseBills: store.snapshot.purchaseBills.length,
    salesBills: store.snapshot.salesBills.length,
    customers: store.snapshot.customers.length,
    suppliers: store.snapshot.suppliers.length,
  });
}

void testDbConnection()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('DB check failed:', err);
    process.exit(1);
  });
