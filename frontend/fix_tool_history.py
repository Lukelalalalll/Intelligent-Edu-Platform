import re

with open("src/features/file-center/components/ToolHistoryTab.tsx", "r") as f:
    content = f.read()

# add ConfirmModal import
if "ConfirmModal" not in content:
    content = content.replace("import styles from '../styles/fileCenter.module.css';", "import styles from '../styles/fileCenter.module.css';\nimport ConfirmModal from '../../../shared/components/ConfirmModal';")

# add state
if "const [confirmDelete, setConfirmDelete]" not in content:
    content = content.replace("const [selected, setSelected] = useState<Set<string>>(new Set());", "const [selected, setSelected] = useState<Set<string>>(new Set());\n    const [confirmDelete, setConfirmDelete] = useState<{show: boolean, id?: string, batch?: boolean}>({show: false});")

# update handleDelete
handle_del_old = """    const handleDelete = async (id: string) => {
        if (!confirm('Delete this history record?')) return;
        try {"""
handle_del_new = """    const handleDelete = async (id: string) => {
        setConfirmDelete({ show: true, id });
    };

    const confirmDeleteAction = async () => {
        if (!confirmDelete.id) return;
        try {
            const id = confirmDelete.id;"""
content = content.replace(handle_del_old, handle_del_new)

# update batch delete
batch_old = """    const handleBatchDelete = async () => {
        const ids = Array.from(selected);
        if (!ids.length) return;
        if (!confirm(`Delete ${ids.length} selected records?`)) return;
        try {"""
batch_new = """    const handleBatchDelete = async () => {
        if (!selected.size) return;
        setConfirmDelete({ show: true, batch: true });
    };

    const confirmBatchDeleteAction = async () => {
        const ids = Array.from(selected);
        if (!ids.length) return;
        try {"""
content = content.replace(batch_old, batch_new)

# Add ConfirmModal JSX
modal_old = """        </>
    );
}"""
modal_new = """            <ConfirmModal 
                open={confirmDelete.show}
                title={confirmDelete.batch ? "Batch Delete" : "Delete Record"}
                message={confirmDelete.batch ? `Are you sure you want to delete ${selected.size} records?` : "Are you sure you want to delete this history record?"}
                confirmLabel="Delete"
                confirmDanger={true}
                onClose={() => setConfirmDelete({ show: false })}
                onConfirm={() => {
                    if (confirmDelete.batch) confirmBatchDeleteAction();
                    else confirmDeleteAction();
                }}
            />
        </>
    );
}"""
content = content.replace(modal_old, modal_new)

with open("src/features/file-center/components/ToolHistoryTab.tsx", "w") as f:
    f.write(content)

