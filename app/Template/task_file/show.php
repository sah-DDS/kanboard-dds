<details class="accordion-section" <?= empty($files) && empty($images) ? '' : 'open' ?>>
    <summary class="accordion-title"><?= t('Attachments') ?></summary>
    <div class="accordion-content">
        <?= $this->render('task_file/images', array('task' => $task, 'images' => $images)) ?>
        <?= $this->render('task_file/files', array('task' => $task, 'files' => $files)) ?>
    </div>
    <div style="padding-top: 1rem;">

        <?= $this->modal->medium('file', t('Attach a document'), 'TaskFileController', 'create', array('task_id' => $task['id'])) ?>
    </div>
</details>