use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ConfigAccount {
    pub owner: Pubkey,
    pub creator: Pubkey,
}

impl ConfigAccount {
    pub const LEN: usize = 8 + ConfigAccount::INIT_SPACE;
}
