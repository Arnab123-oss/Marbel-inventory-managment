import type mongoose from 'mongoose';
import {isMongoConnected} from '../config/db.ts';

export class MongooseRepositoryBase<T extends {id: string}> {
  readonly modelName: string;
  readonly mongoModel: mongoose.Model<T>;

  constructor(modelName: string, mongoModel: mongoose.Model<T>) {
    this.modelName = modelName;
    this.mongoModel = mongoModel;
  }

  async syncDoc(doc: T): Promise<void> {
    if (!isMongoConnected()) return;
    try {
      await this.mongoModel.findOneAndUpdate(
        {id: doc.id},
        {$set: {...doc}},
        {upsert: true, new: true},
      );
    } catch (err) {
      console.warn(`MongoDB sync skipped for ${this.modelName}/${doc.id}:`, err);
    }
  }

  async deleteDoc(id: string): Promise<void> {
    if (!isMongoConnected()) return;
    try {
      await this.mongoModel.deleteOne({id});
    } catch (err) {
      console.warn(`MongoDB delete skipped for ${this.modelName}/${id}:`, err);
    }
  }
}
