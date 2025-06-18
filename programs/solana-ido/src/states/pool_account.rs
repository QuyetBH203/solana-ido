use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PoolAccount {
    pub pool_id: u64,
    pub creator: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub claim_time: i64,
    pub sale_amount: u64,      // Total tokens for sale
    pub price_per_token: u64,  // Price in currency token
    pub currency_mint: Pubkey, // SPL token mint for payment
    pub token_mint: Pubkey,    // IDO token mint
    pub total_raised: u64,     // Total currency raised
    pub is_active: bool,
    pub bump: u8,
}

impl PoolAccount {
    pub const LEN: usize = 8 + PoolAccount::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct UserPurchase {
    pub user: Pubkey,
    pub pool_id: u64,
    pub amount_purchased: u64, // Amount of currency tokens spent
    pub tokens_to_claim: u64,  // Amount of IDO tokens to claim
    pub has_claimed: bool,
    pub bump: u8,
}

impl UserPurchase {
    pub const LEN: usize = 8 + UserPurchase::INIT_SPACE;
} 