"use server";

import { addToCart, removeFromCart } from "@/server/site/cart";

/** Adds a name to the visitor's cart; returns the cart. */
export async function addToCartAction(name: string): Promise<string[]> {
  return addToCart(name);
}

export async function removeFromCartAction(name: string): Promise<string[]> {
  return removeFromCart(name);
}
