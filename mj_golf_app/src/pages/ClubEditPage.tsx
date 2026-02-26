import { useNavigate, useParams } from 'react-router';
import { useState } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { ClubForm, type ClubFormData } from '../components/clubs/ClubForm';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { useClub, addClub, updateClub, deleteClub } from '../hooks/useClubs';
import { LoadingPage } from '../components/ui/LoadingPage';

export function ClubEditPage() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const club = useClub(clubId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEditing = Boolean(clubId);

  // While loading an existing club
  if (isEditing && club === undefined) return <LoadingPage title="Edit Club" showBack />;

  const handleSave = async (data: ClubFormData) => {
    if (isEditing && clubId) {
      await updateClub(clubId, data);
    } else {
      await addClub(data);
    }
    navigate('/bag');
  };

  const handleDelete = async () => {
    if (clubId) {
      await deleteClub(clubId);
      navigate('/bag');
    }
  };

  return (
    <>
      <TopBar title={isEditing ? 'Edit Club' : 'Add Club'} showBack />
      <div className="px-4 py-4">
        <ClubForm
          initial={club}
          onSave={handleSave}
          onDelete={isEditing ? () => setShowDeleteConfirm(true) : undefined}
          onCancel={() => navigate(-1)}
        />
      </div>

      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Club"
      >
        <p className="mb-4 text-sm text-text-medium">
          Are you sure you want to delete <strong>{club?.name}</strong>? Session data for this club
          will be preserved.
        </p>
        <div className="flex gap-3">
          <Button variant="danger" onClick={handleDelete} className="flex-1">
            Delete
          </Button>
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} className="flex-1">
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}
