import React from 'react';
import { motion } from 'framer-motion';
import styles from '../styles/home.module.css';

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: "spring" as const, stiffness: 300, damping: 24 }
    }
};

interface WelcomeBannerProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    className?: string;
}

const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ title, subtitle, className }) => {
    return (
        <motion.section
            variants={itemVariants}
            className={`${styles['welcome-banner']} ${className || ''}`}
        >
            <motion.h1 variants={itemVariants}>
                {title || 'Welcome to HKU Educational Tools Platform'}
            </motion.h1>
            <motion.p variants={itemVariants}>
                {subtitle || 'Your gateway to intelligent learning and educational resources'}
            </motion.p>
        </motion.section>
    );
};

export default WelcomeBanner;