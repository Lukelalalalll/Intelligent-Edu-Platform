import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from '../styles/home.module.css';

const ToolCard = ({ title, desc, icon, url }) => {
    const cardRef = useRef(null);
    const sheenRef = useRef(null);
    const rectRef = useRef(null);
    const rafRef = useRef(null);

    const handleMouseEnter = () => {
        if (cardRef.current) {
            cardRef.current.style.transition = 'transform 0.2s ease-out';
            rectRef.current = cardRef.current.getBoundingClientRect();
        }
    };

    const handleMouseMove = (e) => {
        if (!cardRef.current || !sheenRef.current || !rectRef.current) return;
        const { clientX, clientY } = e;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            const rect = rectRef.current;
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = ((y - centerY) / centerY) * -8;
            const rotateY = ((x - centerX) / centerX) * 8;

            cardRef.current.style.transform = `perspective(1000px) translateY(-15px) scale(1.02) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            sheenRef.current.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.3), transparent 50%)`;
            sheenRef.current.style.opacity = '1';
        });
    };

    const handleMouseLeave = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rectRef.current = null;
        if (cardRef.current) {
            cardRef.current.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
            cardRef.current.style.transform = '';
        }
        if (sheenRef.current) sheenRef.current.style.opacity = '0';
    };

    useEffect(() => {
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, []);

    return (
        <div className={styles.card} ref={cardRef} onMouseMove={handleMouseMove} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            <div className={styles['card-sheen']} ref={sheenRef} style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4), transparent 60%)',
                opacity: '0', pointerEvents: 'none', zIndex: '3', mixBlendMode: 'overlay', transition: 'opacity 0.4s ease'
            }}></div>
            <div className={styles['card-content']}>
                <div className={styles['card-icon']}><i className={`fas ${icon}`}></i></div>
                <h3 className={styles['card-title']}>{title}</h3>
                <p className={styles['card-description']}>{desc}</p>
                <Link to={url} className={styles['card-link']}>Enter</Link>
            </div>
        </div>
    );
};

export default ToolCard;