import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import styles from '../styles/EmailProviderSelect.module.css';

const GmailIcon = () => (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <path fill="#EA4335" d="M5.5 8l18.5 14L42.5 8v4L24 26 5.5 12z" />
        <path fill="#4285F4" d="M42.5 8H37L24 19 11 8H5.5v4l7 5.3V38h6V20.6L24 25l5.5-4.4V38h6V17.3l7-5.3z" />
        <path fill="#34A853" d="M11 8H5.5A3.5 3.5 0 0 0 2 11.5v25A3.5 3.5 0 0 0 5.5 40H18V17.3z" />
        <path fill="#FBBC05" d="M37 8h5.5A3.5 3.5 0 0 1 46 11.5v25a3.5 3.5 0 0 1-3.5 3.5H30V17.3z" />
    </svg>
);

const QQMailIcon = () => (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <circle cx="24" cy="18" r="12" fill="#fff" />
        <ellipse cx="24" cy="18" rx="10" ry="11" fill="#1A73E8" />
        <ellipse cx="21" cy="15" rx="2.5" ry="3" fill="#fff" />
        <ellipse cx="27" cy="15" rx="2.5" ry="3" fill="#fff" />
        <circle cx="21.5" cy="15.5" r="1.2" fill="#1A73E8" />
        <circle cx="27.5" cy="15.5" r="1.2" fill="#1A73E8" />
        <path d="M18 22 c2 3 10 3 12 0" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M14 28 c-2 4 0 8 4 8 l2 0 c0-3 2-5 4-6" fill="#FBBC05" />
        <path d="M34 28 c2 4 0 8-4 8 l-2 0 c0-3-2-5-4-6" fill="#FBBC05" />
        <ellipse cx="24" cy="40" rx="6" ry="2.5" fill="#FF6D00" />
    </svg>
);

const NetEase163Icon = () => (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <rect x="4" y="10" width="40" height="28" rx="4" fill="#D0021B" />
        <text x="24" y="30" textAnchor="middle" fill="#fff" fontWeight="800" fontSize="16" fontFamily="Arial, sans-serif">163</text>
    </svg>
);

const HKUIcon = () => (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <path d="M24 4 L6 16 V38 H18 V26 H30 V38 H42 V16 Z" fill="#003865" stroke="#FFB900" strokeWidth="2" />
        <text x="24" y="22" textAnchor="middle" fill="#FFB900" fontWeight="800" fontSize="9" fontFamily="Georgia, serif">HKU</text>
    </svg>
);

const PROVIDERS = [
    {
        id: 'gmail',
        name: 'Gmail',
        description: 'Google Workspace & personal Gmail accounts',
        badge: 'Recommended',
        badgeClass: 'badgeGreen',
        iconComponent: GmailIcon,
        cardClass: 'cardGmail',
    },
    {
        id: 'qq',
        name: 'QQ邮箱',
        description: 'Tencent QQ Mail via SMTP/IMAP protocol',
        badge: '国内首选',
        badgeClass: 'badgeBlue',
        iconComponent: QQMailIcon,
        cardClass: 'cardQQ',
    },
    {
        id: '163',
        name: '163邮箱',
        description: 'NetEase 163 Mail via SMTP/IMAP protocol',
        badge: '网易出品',
        badgeClass: 'badgeRed',
        iconComponent: NetEase163Icon,
        cardClass: 'cardNetEase',
    },
    {
        id: 'hku',
        name: 'HKU Connect',
        description: 'connect.hku.hk — Office 365 by Microsoft',
        badge: 'HKU Official',
        badgeClass: 'badgeGold',
        iconComponent: HKUIcon,
        cardClass: 'cardHKU',
    },
];

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
    exit: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
};

const cardVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
    exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } },
};

export default function EmailProviderSelect({ onSelectProvider }) {
    return (
        <div className={styles.selectPage}>
            <div className={styles.bgOrbA} />
            <div className={styles.bgOrbB} />

            <motion.div
                className={styles.content}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className={styles.heading}>
                    <div className={styles.headingIcon}>
                        <i className="fas fa-envelope-open-text" />
                    </div>
                    <h1>Choose Your Email Provider</h1>
                    <p>Connect your inbox to start AI-powered email management</p>
                </div>

                <motion.div
                    className={styles.grid}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    {PROVIDERS.map((provider) => {
                        const IconComp = provider.iconComponent;
                        const isComingSoon = provider.id === 'hku';
                        return (
                            <motion.button
                                key={provider.id}
                                type="button"
                                className={`${styles.card} ${styles[provider.cardClass]}`}
                                variants={cardVariants}
                                whileHover={isComingSoon ? {} : { y: -6, transition: { duration: 0.2 } }}
                                whileTap={isComingSoon ? {} : { scale: 0.97 }}
                                onClick={() => !isComingSoon && onSelectProvider(provider.id)}
                                disabled={isComingSoon}
                            >
                                <div className={styles.cardGlow} />
                                <div className={styles.cardInner}>
                                    <div className={styles.iconWrap}>
                                        <IconComp />
                                    </div>
                                    <h3>{provider.name}</h3>
                                    <p>{provider.description}</p>
                                    <span className={`${styles.badge} ${styles[provider.badgeClass]}`}>
                                        {isComingSoon ? 'Coming Soon' : provider.badge}
                                    </span>
                                </div>
                                {provider.id === 'gmail' && <div className={styles.gmailColorBar} />}
                                {provider.id === '163' && <div className={styles.neteaseDiagonal} />}
                                {provider.id === 'hku' && <div className={styles.hkuGoldLine} />}
                            </motion.button>
                        );
                    })}
                </motion.div>

                <div className={styles.footer}>
                    <p><i className="fas fa-lock" /> Your credentials are encrypted and never stored on our servers</p>
                </div>
            </motion.div>
        </div>
    );
}

EmailProviderSelect.propTypes = {
    onSelectProvider: PropTypes.func.isRequired,
};
