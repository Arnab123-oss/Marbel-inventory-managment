import mongoose from 'mongoose';
import {getActiveStore} from '../services/storeState.ts';
import type {StoredUser} from '../types/inventory.ts';
import {DEFAULT_COMPANY_ID} from '../utils/money.ts';
import {MongooseRepositoryBase} from './BaseModel.ts';

export const userSchema = new mongoose.Schema<StoredUser>(
  {
    id: {type: String, required: true, unique: true, index: true},
    companyId: {type: String, default: DEFAULT_COMPANY_ID, index: true},
    authorizedBranchIds: {type: [String], default: undefined},
    name: {type: String, required: true, trim: true},
    email: {type: String, required: true, trim: true, lowercase: true, unique: true, index: true},
    initials: {type: String, required: true},
    role: {type: String, required: true},
    facilityScope: {type: String, required: true},
    enabled: {type: Boolean, default: true},
    passwordSalt: {type: String, required: true},
    passwordHash: {type: String, required: true},
    createdAt: {type: String, required: true},
  },
  {timestamps: true},
);

userSchema.index({companyId: 1, role: 1});

export const UserDocModel =
  (mongoose.models.User as mongoose.Model<StoredUser>) ||
  mongoose.model<StoredUser>('User', userSchema);

class UserModel extends MongooseRepositoryBase<StoredUser> {
  constructor() {
    super('User', UserDocModel);
  }

  findById(id: string): StoredUser | undefined {
    return getActiveStore().users[id];
  }

  findByEmail(email: string): StoredUser | undefined {
    const normalized = email.trim().toLowerCase();
    return Object.values(getActiveStore().users).find(
      (u) => u.email.toLowerCase() === normalized,
    );
  }

  upsert(user: StoredUser): StoredUser {
    const normalized: StoredUser = {
      ...user,
      companyId: user.companyId || DEFAULT_COMPANY_ID,
      enabled: user.enabled !== false,
    };
    getActiveStore().users[normalized.id] = normalized;
    void this.syncDoc(normalized);
    return normalized;
  }
}

export const User = new UserModel();
export default User;
