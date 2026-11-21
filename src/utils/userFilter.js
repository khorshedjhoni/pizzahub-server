// src/utils/userFilter.js
import { ObjectId } from "mongodb";

export function findUserFilter(id) {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === String(id)
    ? { _id: new ObjectId(id) }
    : { _id: String(id) };
}