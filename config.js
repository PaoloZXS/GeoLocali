// database credentials are stored here so other modules can import them
module.exports = {
    DB_URL: "libsql://locali-paolozxs.aws-eu-west-1.turso.io",
    DB_TOKEN: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzIyODk0NDQsImlkIjoiMDE5Y2E0YWUtODQwMS03MWQwLWE0YWItNzIwMTM4MmNiYmJjIiwicmlkIjoiZGUzMmVjNjQtMDQwMy00MjVmLTgzYmMtZDA0MmU5MTM2NGE5In0.h5wm0X6VDAb_GT0e8uHhhfFpunLVEsbogrJUaW5QbSvUEGqcUsUUmhgKNHIhIFb_3CXmO1W55Dden9qOwB6pDg",
    // Dropbox settings.  For the new refresh-token workflow you'll need
    // to open the Dropbox App Console, create/edit your app, and then
    // either (a) copy a short-lived token here or
    // (b) obtain a refresh token and fill in the three fields below.
    //
    //    DROPBOX_APP_KEY      : '...'
    //    DROPBOX_APP_SECRET   : '...'
    //    DROPBOX_REFRESH_TOKEN: 'dpLVPF1OxcEAAAAAAAAAARBo6JmS9tRwkUdXAEcPh9liMx8M-wubsucOZOgrH-Zj'
    //
    // you can also set these via environment variables of the same name.
    
    // long‑lived credentials for Dropbox; replace the placeholders below
    DROPBOX_APP_KEY: process.env.DROPBOX_APP_KEY || 'v370ovwbpxli8mk',
    DROPBOX_APP_SECRET: process.env.DROPBOX_APP_SECRET || '89qyae8ghimlu33',
    DROPBOX_REFRESH_TOKEN: process.env.DROPBOX_REFRESH_TOKEN || 'dpLVPF1OxcEAAAAAAAAAARBo6JmS9tRwkUdXAEcPh9liMx8M-wubsucOZOgrH-Zj',

    // static access token is kept as a fallback but will expire quickly
    DROPBOX_TOKEN: process.env.DROPBOX_TOKEN || 'sl.u.AGXwnuR-aNGScx-UXWXxosYPAOG9oC0BDYvccYVlafy57C-G7uX1REZ9YgcU4ymhOvcIpb6ADJ6qRe8eP96HyhLUKgiKRdgppy3qnlJ6N_sRJE7Bdfsh2C3Iya4GiqXa73hhlw5wRqo7vGB3ylnpuz1qiyksyQzIAuwiBR_tNR0bm8WC5SkSsTfkb5SsMrd8yA2WSCCqJcIMLAb04I11qcBS4T3QtGbUYZSi3JnA3b7wsiy_UL48muFZ5vvslQ-ncfgFOcMFlI-Rwd2_intMd22IJqGa-HGemAlcUGKJYG-PAMN7KewpRmayyJ6RGZ87O7Z9atdh4qPyHE1ez6nBNEVYN-h10qC76DiM027Fc5nfRNqIu-19WL82AL-eNZtz2sqfL_vSNQ1gw8AGVYNyM6-_WUXiWjllotxPkLnDADYaT9iYedR-3EgFa2_3TsOgG7tCeYQP32tyzE2r-Lumy81cC6zUXCIffTe5GMlQsKoudIBEx-WWhY6uKrarNRONRoD8dYtDZCroHtXpOxW1bfnAXhq5DEUNBz_pIBMyjfq4HNn-0EABxI-VWrZpm-Dbf5hbVk5vUtIj0-vaA3TtFQKmwCklV0iw-349fE7GSoUbA5dRjrco6jyAN1IL5aQ75TDArQsx0mUXDo66FNt4RzPWWcbtBBXFc4nt4D_d5sc6fdrIYbKZwZPB-sF8AP744P41iqIM2C7GvJGqp1tkPMbjAnPoa-4kA5okvDfbe6ZXiDp9XtgEnZZeHmQboafDOYtyoQU4YYKE9YW1-QS-4dPyvMAZEVzZ_tOitONC_2Fl3M88avh8EdBPx7IzvuemtdvOg9az3QcvQpZh0I7XURn_HUHB7Ie1qnUp9_Mi24k5Zy58fpYNkie0Q0UhdMmD0YVmCE-lhtNjUVIATtcvNmsMf3egosYxXx4XKFU9nX2TsdLLwBG02S7_ayzLCVkuKJN-Chts1PTKkXjMNBlGDR2xsr1yUVJt16GFryPjiyHi0aG0Va1YdBlX9XV99PONRpaO4rbcRT_0OSx-rubw8UGgfg6JPzkXyEdvZGIwwRijmDWKJHQvEaaomW0ABy1w1R8KBtZGFVyBP_bdsNQU_riwkIX3C_xvZmRJadPUQnkSQmuu0ui3j4FP4nY2u_qTifute5C3eiRYBTkiACqeOHb_sZWjubXE0yb35xlg8sVjBymhNICF8TC2is5p6fV3eikXuWDHBoMKedl_Ws98h9T2W2kZ8smYcWztcZGsh5Y-lFGRPaMBPqiZFemxvWU-S8btUoRafShgpwykFrdy8m-FM3qMttQE5hlwmCdFWFBNvvAf_n6gGiyX-B6dVSiDgKtx2litu1fLCBJWdSHmxR0eBmxILSCdWEp0dIZKQaxEyTysAV9eIz3vb2ZuUlX_Jl35uFAZU-iYIaPjfKAPFlm4St1AZvQaoZzvLAWcAiU09rcYeP0TAAcLsYTAPVlxO84',
    JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret'
};