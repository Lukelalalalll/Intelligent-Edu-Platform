import React from 'react';
import { motion } from 'framer-motion';
import styles from '../../../styles/home/home.module.css';

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: "spring", stiffness: 300, damping: 24 }
    }
};

const WelcomeBanner = () => {
    return (
        <motion.section
            variants={itemVariants}
            className={styles['welcome-banner']}
        >
            <motion.h1 variants={itemVariants}>
                Welcome to HKU Educational Tools Platform
            </motion.h1>
            <motion.p variants={itemVariants}>
                Your gateway to intelligent learning and educational resources
            </motion.p>
        </motion.section>
    );
};

export default WelcomeBanner;